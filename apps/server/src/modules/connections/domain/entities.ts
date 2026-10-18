import type { ConnectionRow } from "../../../db/schema.js";

/**
 * Visão pública de uma conexão (resposta da API).
 *
 * A senha do Redis é tratada como credencial: entra no payload de criação e é
 * usada internamente pelo RedisManager, mas NUNCA é serializada de volta —
 * o frontend não retorna o segredo para o navegador.
 */
export interface RedisConnectionView {
  id: string;
  name: string;
  host: string;
  port: number;
  db: number;
  createdAt: string;
}

export function toConnectionView(
  row: Pick<ConnectionRow, "id" | "name" | "host" | "port" | "db" | "createdAt">,
): RedisConnectionView {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    db: row.db,
    createdAt: row.createdAt,
  };
}

/** Entidade de domínio completa (uso interno apenas — inclui a senha). */
export interface RedisConnection extends RedisConnectionView {
  password?: string;
}

export function toDomainConnection(row: ConnectionRow): RedisConnection {
  return {
    ...toConnectionView(row),
    password: row.password ?? undefined,
  };
}

/** Payload de criação/atualização — sem `id`/`createdAt`, gerados pela aplicação. */
export interface ConnectionInput {
  name: string;
  host: string;
  port: number;
  password?: string;
  db?: number;
}
