import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { AppDatabase } from "../../../db/client.js";
import { connections, type ConnectionRow } from "../../../db/schema.js";
import type { ConnectionInput, RedisConnection } from "../domain/entities.js";
import { toDomainConnection } from "../domain/entities.js";
import type { ConnectionRepository } from "../domain/ports.js";

/** Implementação Drizzle do repositório de conexões. */
export class DrizzleConnectionRepository implements ConnectionRepository {
  constructor(private readonly db: AppDatabase) {}

  async findAll(): Promise<RedisConnection[]> {
    return this.db.select().from(connections).all().map(toDomainConnection);
  }

  async findById(id: string): Promise<RedisConnection | null> {
    const row = this.db.select().from(connections).where(eq(connections.id, id)).get();
    return row ? toDomainConnection(row as ConnectionRow) : null;
  }

  async create(input: ConnectionInput, now = new Date()): Promise<RedisConnection> {
    const row: ConnectionRow = {
      id: randomUUID(),
      name: input.name,
      host: input.host,
      port: input.port,
      password: input.password ?? null,
      db: input.db ?? 0,
      createdAt: now.toISOString(),
    };
    this.db.insert(connections).values(row).run();
    return toDomainConnection(row);
  }

  async update(id: string, input: Partial<ConnectionInput>): Promise<RedisConnection | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const values: Partial<ConnectionRow> = {
      name: input.name ?? existing.name,
      host: input.host ?? existing.host,
      port: input.port ?? existing.port,
      db: input.db ?? existing.db,
    };
    if (input.password !== undefined && input.password !== "") {
      values.password = input.password;
    }
    this.db.update(connections).set(values).where(eq(connections.id, id)).run();
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.delete(connections).where(eq(connections.id, id)).run();
    return result.changes > 0;
  }
}
