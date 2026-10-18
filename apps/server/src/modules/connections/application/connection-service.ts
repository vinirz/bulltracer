import type { Logger } from "pino";

import { conflict, notFound } from "../../../lib/errors.js";
import type { ConnectionInput, RedisConnection } from "../domain/entities.js";
import type { ConnectionRepository } from "../domain/ports.js";
import type { RedisManager } from "../infrastructure/redis-manager.js";

/**
 * Casos de uso de Conexões (CRUD).
 *
 * Regra de ouro: conexão = configuração; nada aqui acessa jobs. A validação de
 * reachability é feita sob demanda na camada de inspeção (queue-service), não
 * no CRUD, para não bloquear a criação de conexões em manutenção.
 */
export class ConnectionService {
  constructor(
    private readonly repository: ConnectionRepository,
    private readonly redisManager: RedisManager,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<RedisConnection[]> {
    return this.repository.findAll();
  }

  async get(id: string): Promise<RedisConnection> {
    const connection = await this.repository.findById(id);
    if (!connection) throw notFound("CONNECTION_NOT_FOUND", `Conexão ${id} não encontrada`);
    return connection;
  }

  async create(input: ConnectionInput): Promise<RedisConnection> {
    const existing = await this.repository.findAll();
    const duplicate = existing.find(
      (c) =>
        c.name.toLowerCase() === input.name.toLowerCase() && 
        c.host === input.host &&
        c.port === input.port &&
        c.db === (input.db ?? 0),
    );
    if (duplicate) {
      throw conflict("CONNECTION_ALREADY_EXISTS", `Conexão "${input.name}" já existe`);
    }
    const created = await this.repository.create(input);
    this.logger.info({ connectionId: created.id, name: created.name }, "Conexão Redis criada");
    return created;
  }

  async update(id: string, input: Partial<ConnectionInput>): Promise<RedisConnection> {
    const updated = await this.repository.update(id, input);
    if (!updated) throw notFound("CONNECTION_NOT_FOUND", `Conexão ${id} não encontrada`);
    // Credenciais mudaram → clientes Redis antigos devem ser descartados.
    await this.redisManager.closeConnection(id);
    this.logger.info({ connectionId: id }, "Conexão Redis atualizada");
    return updated;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw notFound("CONNECTION_NOT_FOUND", `Conexão ${id} não encontrada`);
    await this.redisManager.closeConnection(id);
    this.logger.info({ connectionId: id }, "Conexão Redis excluída");
  }

  /**
   * Teste de reachability — usado pelo form de conexão (POST /api/connections/test).
   * Nunca falha a requisição: um teste "falhou" é um resultado { ok: false }
   * com a mensagem legível (senha errada, host inalcançável, timeout...).
   */
  async test(input: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  }): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const startedAt = Date.now();
    try {
      await this.redisManager.probe(input);
      const latencyMs = Date.now() - startedAt;
      return {
        ok: true,
        latencyMs,
        message: `Conectado a ${input.host}:${input.port} em ${latencyMs}ms.`,
      };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const message = this.describeRedisError(raw, input);
      return { ok: false, latencyMs: Date.now() - startedAt, message };
    }
  }

  private describeRedisError(
    raw: string,
    input: { host: string; port: number },
  ): string {
    if (raw.includes("NOAUTH")) return "O Redis exige autenticação — informe a senha.";
    if (raw.includes("WRONGPASS") || raw.includes("ERR invalid password"))
      return "Senha incorreta para este Redis.";
    if (raw.includes("ECONNREFUSED"))
      return `Conexão recusada em ${input.host}:${input.port} — o Redis está no ar?`;
    if (raw.includes("ENOTFOUND"))
      return `Host ${input.host} não foi resolvido — verifique o endereço.`;
    if (raw.includes("ETIMEDOUT") || raw.includes("Timeout"))
      return `Timeout ao conectar em ${input.host}:${input.port}.`;
    return `Falha ao conectar: ${raw}`;
  }
}
