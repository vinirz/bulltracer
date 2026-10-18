import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

export type AppDatabase = BetterSQLite3Database<typeof schema> & {
  $client: InstanceType<typeof Database>;
};

/**
 * Abre (e migra) o banco SQLite do dashboard.
 *
 * `mode`: "file" cria uma base persistida em `DATABASE_PATH`;
 * `memory` é usado pelos testes (super rápido, zero side effects).
 */
export function openDatabase(databasePath: string, mode: "file" | "memory" = "file"): AppDatabase {
  if (mode === "memory") {
    const sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    return drizzle(sqlite, { schema });
  }

  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

/**
 * Cria as tabelas caso ainda não existam (idempotente).
 * Em produção, troque por `drizzle-kit migrate` push; aqui o SQL DDL explícito
 * mantém o bootstrap self-contained para o modelo Self-Hosted via Docker.
 */
export function runMigrations(db: AppDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS connections (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      host       TEXT NOT NULL,
      port       INTEGER NOT NULL,
      password   TEXT,
      db         INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      url        TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id            TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      queue_name    TEXT NOT NULL,
      metric_type   TEXT NOT NULL CHECK (metric_type IN ('failed_jobs','wait_time_exceeded')),
      threshold     REAL NOT NULL,
      webhook_id    TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_alert_rules_connection_queue
      ON alert_rules (connection_id, queue_name);
  `);
}
