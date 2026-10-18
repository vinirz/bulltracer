import type { ConnectionOptions, QueueOptions, RedisOptions } from "bullmq";
import { Queue, QueueEvents } from "bullmq";
import { Redis as IORedis, type Redis } from "ioredis";

import type { RedisConnection } from "../domain/entities.js";
import type { Logger } from "pino";

/**
 * Infraestrutura de acesso ao Redis alvo.
 *
 * - Mantém UM client IORedis por (connectionId, uso) — `clients` para leitura
 *   (SCAN/snapshots) e `eventClients` para o stream reativo.
 * - Fabrica `Queue` e `QueueEvents` do BullMQ INJETANDO esses clients, e não
 *   options: o BullMQ aceita uma instância ioredis pronta, e assim o ciclo de
 *   vida do socket continua sob nosso controle — `disconnect()` encerra na
 *   hora, mesmo que o Redis nunca tenha conectado (evita o hang conhecido de
 *   `QueueEvents.close()` com host inalcançável).
 * - Nada de jobs é gravado: só leitura e escuta de eventos.
 */
export class RedisManager {
  private readonly clients = new Map<string, Redis>();
  private readonly eventClients = new Map<string, Redis>();
  private readonly queues = new Map<string, Queue>();
  private readonly queueEvents = new Map<string, QueueEvents>();

  constructor(private readonly logger: Logger) {}

  private key(connectionId: string, queueName?: string, scope?: "events"): string {
    const prefix = scope ? `${scope}:` : "";
    return prefix + (queueName ? `${connectionId}:${queueName}` : connectionId);
  }

  private clientOptions(connection: RedisConnection): RedisOptions {
    return {
      host: connection.host,
      port: connection.port,
      password: connection.password,
      db: connection.db,
      maxRetriesPerRequest: null,
      connectTimeout: 3000,
      // Retry limitado: nunca deixar timers de reconexão infinitos vivos
      // (protege o Event Loop e permite `close()` sempre resolver).
      retryStrategy: (times) => Math.min(times * 200, 2000),
    };
  }

  private createClient(connection: RedisConnection): Redis {
    const client = new IORedis(this.clientOptions(connection));
    client.on("error", (error) => {
      this.logger.error({ connectionId: connection.id, error }, "Falha de conexão Redis");
    });
    return client;
  }

  /** Client de leitura/inspeção (SCAN, snapshots) da conexão. */
  getClient(connection: RedisConnection): Redis {
    const key = this.key(connection.id);
    let client = this.clients.get(key);
    if (!client) {
      client = this.createClient(connection);
      this.clients.set(key, client);
    }
    return client;
  }

  /**
   * Teste de reachability usado pelo endpoint POST /api/connections/test.
   * Client descartável (sem retry, timeout curto) — nunca entra nos pools.
   */
  async probe(input: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  }): Promise<void> {
    const client = new IORedis({
      host: input.host,
      port: input.port,
      password: input.password,
      db: input.db ?? 0,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    try {
      await client.ping();
    } finally {
      client.disconnect();
    }
  }

  /** Queue BullMQ para leitura de jobs/contadores (nenhum job é gravado). */
  getQueue(connection: RedisConnection, queueName: string): Queue {
    const key = this.key(connection.id, queueName);
    let queue = this.queues.get(key);
    if (!queue) {
      const options: QueueOptions = { connection: this.getClient(connection) };
      queue = new Queue(queueName, options);
      this.queues.set(key, queue);
    }
    return queue;
  }

  /** QueueEvents dedicado a uma fila — base do Motor Reativo (The Watcher). */
  getQueueEvents(connection: RedisConnection, queueName: string): QueueEvents {
    const key = this.key(connection.id, queueName, "events");
    let events = this.queueEvents.get(key);
    if (!events) {
      const eventKey = this.key(connection.id, undefined, "events");
      let eventClient = this.eventClients.get(eventKey);
      if (!eventClient) {
        eventClient = this.createClient(connection);
        this.eventClients.set(eventKey, eventClient);
      }
      const options: QueueOptions<ConnectionOptions> = { connection: eventClient };
      events = new QueueEvents(queueName, options);
      this.queueEvents.set(key, events);
    }
    return events;
  }

  /**
   * Fechamento COM timeout: o `close()` do BullMQ pode ficar pendurado quando
   * o Redis jamais conectou; a corrida garante progresso e, em último caso,
   * derruba o socket ioredis que nós mesmos criamos (sempre termina).
   */
  private async boundedClose(run: () => Promise<unknown>, timeoutMs = 1000): Promise<void> {
    await Promise.race([
      run().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  /** Fechamento seguro de um stream QueueEvents (usado pelo Watcher). */
  async closeQueueEvents(events: QueueEvents): Promise<void> {
    await this.boundedClose(() => events.close());
  }

  /**
   * Encerra de vez o client ioredis de eventos da conexão. Chamado quando
   * nenhuma fila dessa conexão permanece monitorada — mata o loop interno de
   * re-leitura do QueueEvents (que, com Redis inalcançável, retentaria para
   * sempre e manteria o processo vivo).
   */
  async disposeEventClient(connectionId: string): Promise<void> {
    const key = this.key(connectionId, undefined, "events");
    const client = this.eventClients.get(key);
    if (client) {
      client.disconnect();
      this.eventClients.delete(key);
    }
  }

  /** Encerra os clients de uma conexão (ex.: conexão excluída via REST). */
  async closeConnection(connectionId: string): Promise<void> {
    for (const [key, client] of [...this.clients]) {
      if (key.startsWith(`${connectionId}:`) || key === connectionId) {
        client.disconnect();
        this.clients.delete(key);
      }
    }
    for (const [key, client] of [...this.eventClients]) {
      if (key.includes(connectionId)) {
        client.disconnect();
        this.eventClients.delete(key);
      }
    }
    for (const [key, queue] of [...this.queues]) {
      if (key.startsWith(`${connectionId}:`)) {
        await this.boundedClose(() => queue.close());
        this.queues.delete(key);
      }
    }
    for (const [key, events] of [...this.queueEvents]) {
      if (key.includes(`${connectionId}:`)) {
        await this.boundedClose(() => events.close());
        this.queueEvents.delete(key);
      }
    }
  }

  /** Shutdown global: fecha tudo (usado no SIGTERM). */
  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.queueEvents.values()].map((events) => this.boundedClose(() => events.close())),
    );
    await Promise.all(
      [...this.queues.values()].map((queue) => this.boundedClose(() => queue.close())),
    );
    for (const client of [...this.clients.values(), ...this.eventClients.values()]) {
      client.disconnect();
    }
    this.queues.clear();
    this.queueEvents.clear();
    this.clients.clear();
    this.eventClients.clear();
  }
}
