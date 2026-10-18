import type { ConnectionInput, RedisConnection } from "./entities.js";

/**
 * Contrato do repositório de conexões (Infrastructure implementa com Drizzle).
 * A camada Application depende desta interface — jamais de SQL concreto.
 */
export interface ConnectionRepository {
  findAll(): Promise<RedisConnection[]>;
  findById(id: string): Promise<RedisConnection | null>;
  create(input: ConnectionInput, now?: Date): Promise<RedisConnection>;
  update(id: string, input: Partial<ConnectionInput>): Promise<RedisConnection | null>;
  delete(id: string): Promise<boolean>;
}
