import type { Logger } from "pino";
import { QueueEvents } from "bullmq";

import type { AlertsService } from "../../alerts/application/alerts-service.js";
import type { WebhookDispatcher } from "../../alerts/infrastructure/webhook-dispatcher.js";
import type { RedisConnection } from "../../connections/domain/entities.js";
import type { RedisManager } from "../../connections/infrastructure/redis-manager.js";
import type {
  BullMqEventType,
  NotificationSink,
  RuleEvaluator,
} from "../domain/events.js";

interface WatchedQueue {
  connection: RedisConnection;
  queueName: string;
  events: QueueEvents;
}

/**
 * 🕵️ The WATCHER — Motor Reativo de Monitoramento.
 *
 * Event-driven, ZERO polling pesado:
 * instancia `QueueEvents` (subscriber nativo do stream global do BullMQ) para
 * cada fila monitorada e reage a `added | active | completed | failed`.
 *
 * Para cada evento:
 *   1. broadcast via WebSocket `{ type: 'BULLMQ_EVENT', ... }`;
 *   2. quando `failed`, consulta as alert_rules da fila; se violadas,
 *      dispara o webhook do canal de forma ASSÍNCRONA (fire-and-forget com
 *      `void dispatch()`, nunca bloqueando o Event Loop).
 *
 * A fila de eventos é única por (connectionId, queueName): o RedisManager
 * reaproveita o `QueueEvents` entre re-init, e `close()` é chamado no shutdown.
 */
export class Watcher {
  private readonly watched = new Map<string, WatchedQueue>();

  constructor(
    private readonly redisManager: RedisManager,
    private readonly alertsService: AlertsService,
    private readonly webhookDispatcher: WebhookDispatcher,
    private readonly evaluator: RuleEvaluator,
    private readonly sink: NotificationSink,
    private readonly logger: Logger,
  ) {}

  private key(connectionId: string, queueName: string): string {
    return `${connectionId}:${queueName}`;
  }

  private async resolveWebhookUrl(webhookId: string): Promise<string | null> {
    const webhook = await this.alertsService.getWebhookSafe(webhookId);
    return webhook?.url ?? null;
  }

  /** Monitora uma fila, abrindo seu QueueEvents (idempotente). */
  async watch(connection: RedisConnection, queueName: string): Promise<void> {
    const key = this.key(connection.id, queueName);
    if (this.watched.has(key)) return;

    const queueEvents = this.redisManager.getQueueEvents(connection, queueName);
    const entry: WatchedQueue = { connection, queueName, events: queueEvents };

    // Listeners tipados por evento (o QueueEvents infere o shape de cada um).
    // Cada evento é encaminhado ao pipeline (broadcast WS + regras de alerta)
    // de forma ASSÍNCRONA — nunca bloqueia o Event Loop do server.
    queueEvents.on("active", (args) => {
      void this.handleEvent(entry, "active", { ...args });
    });
    queueEvents.on("added", (args) => {
      void this.handleEvent(entry, "added", { ...args });
    });
    queueEvents.on("completed", (args) => {
      void this.handleEvent(entry, "completed", { ...args });
    });
    queueEvents.on("failed", (args) => {
      void this.handleEvent(entry, "failed", { ...args });
    });
    queueEvents.on("error", (error) => {
      this.logger.error(
        { connectionId: connection.id, queueName, error },
        "Erro no QueueEvents (stream de eventos da fila)",
      );
    });

    // Registra a entrada ANTES da prontidão: `close()` precisa alcançar o
    // QueueEvents mesmo se o Redis estiver inacessível.
    this.watched.set(key, entry);

    // Prontidão NÃO bloqueante: se o Redis estiver fora do ar, o stream
    // tenta reconectar (retryStrategy limitado no RedisManager) e o evento
    // `error`/`ready` reemite; o criador da regra não é travado.
    queueEvents.waitUntilReady().then(
      () => {
        this.logger.info(
          { connectionId: connection.id, queueName },
          "Watcher: fila sendo monitorada (stream pronto)",
        );
      },
      (error: unknown) => {
        this.logger.warn(
          {
            connectionId: connection.id,
            queueName,
            error: error instanceof Error ? error.message : String(error),
          },
          "Watcher: fila inacessível — monitoramento encerrado (redis indisponível)",
        );
        void this.unwatch(connection.id, queueName);
      },
    );
  }

  async unwatch(connectionId: string, queueName: string): Promise<void> {
    const key = this.key(connectionId, queueName);
    const entry = this.watched.get(key);
    if (!entry) return;
    this.watched.delete(key);
    await this.redisManager.closeQueueEvents(entry.events);
    // Nenhuma outra fila dessa conexão monitorada? Encerra o client de
    // eventos para não deixar loops de re-leitura vivos em background.
    const stillWatched = [...this.watched.keys()].some((k) =>
      k.startsWith(`${connectionId}:`),
    );
    if (!stillWatched) {
      await this.redisManager.disposeEventClient(connectionId);
    }
    this.logger.info({ connectionId, queueName }, "Watcher: parou de monitorar fila");
  }

  private async handleEvent(
    entry: WatchedQueue,
    event: BullMqEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { connection, queueName } = entry;
    const occurredAt = Date.now();
    const jobId = typeof payload.jobId === "string" ? payload.jobId : String(payload.jobId ?? "");

    // Ação 1: broadcast em tempo real para todos os clients WebSocket.
    this.sink.broadcast({
      type: "BULLMQ_EVENT",
      connectionId: connection.id,
      queue: queueName,
      event,
      data: { ...payload, jobId },
    });

    // Ação 2: avaliação de regras apenas em eventos terminais de falha.
    if (event !== "failed") return;

    try {
      const rules = await this.alertsService.rulesForQueue(connection.id, queueName);
      if (rules.length === 0) return;

      const violations = await this.evaluator.evaluate(rules, {
        event,
        jobId,
        connectionId: connection.id,
        queueName,
        occurredAt,
      });

      for (const violation of violations) {
        const rule = rules.find((r) => r.id === violation.ruleId);
        if (!rule) continue;
        const webhookUrl = await this.resolveWebhookUrl(rule.webhookId);
        if (!webhookUrl) {
          this.logger.warn(
            { ruleId: rule.id, webhookId: rule.webhookId },
            "Regra violada mas webhook não encontrado; evento descartado",
          );
          continue;
        }
        this.logger.info(
          { ruleId: rule.id, queueName, metricType: violation.metricType, value: violation.value },
          "Regra de alerta VIOLADA — disparando webhook",
        );
        // Fire-and-forget: nunca bloquear o Event Loop com I/O de rede.
        void this.webhookDispatcher
          .dispatch(webhookUrl, {
            ruleId: rule.id,
            queueName,
            metricType: violation.metricType,
            value: violation.value,
            threshold: violation.threshold,
            occurredAt: new Date(occurredAt).toISOString(),
          })
          .catch((error) => {
            this.logger.error(
              { ruleId: rule.id, error: error instanceof Error ? error.message : String(error) },
              "Falha no disparo assíncrono do webhook",
            );
          });
      }
    } catch (error) {
      this.logger.error(
        { connectionId: connection.id, queueName, error },
        "Erro ao avaliar regras de alerta",
      );
    }
  }

  /** Reinicia o monitoramento de uma fila (usado após alterações de regras). */
  async refreshQueue(connection: RedisConnection, queueName: string): Promise<void> {
    await this.unwatch(connection.id, queueName);
    await this.watch(connection, queueName);
  }

  async close(): Promise<void> {
    for (const key of [...this.watched.keys()]) {
      const [connectionId, queueName] = key.split(":");
      if (connectionId && queueName) await this.unwatch(connectionId, queueName);
    }
    this.logger.info("Watcher encerrado");
  }
}
