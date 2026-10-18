import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Schema Drizzle do BullTracer (SQLite local).
 *
 * ⚠️ DUPLA FONTE DE VERDADE:
 * Este banco guarda EXCLUSIVAMENTE configuração do dashboard
 * (conexões Redis, webhooks e regras de alerta).
 * Histórico de jobs (payloads, logs, resultados) NUNCA é persistido aqui —
 * o Redis (BullMQ) é a única fonte de verdade para estado e conteúdo dos jobs.
 */

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  password: text("password"),
  db: integer("db").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  createdAt: text("created_at").notNull(),
});

export const alertRules = sqliteTable(
  "alert_rules",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    queueName: text("queue_name").notNull(),
    metricType: text("metric_type", {
      enum: ["failed_jobs", "wait_time_exceeded"],
    }).notNull(),
    threshold: real("threshold").notNull(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
  },
  // Índice para a consulta quente do Watcher:
  // a cada evento de falha, o lookup é por (connectionId + queueName).
  (table) => [index("idx_alert_rules_connection_queue").on(table.connectionId, table.queueName)],
);

export type ConnectionRow = typeof connections.$inferSelect;
export type NewConnectionRow = typeof connections.$inferInsert;
export type WebhookRow = typeof webhooks.$inferSelect;
export type NewWebhookRow = typeof webhooks.$inferInsert;
export type AlertRuleRow = typeof alertRules.$inferSelect;
export type NewAlertRuleRow = typeof alertRules.$inferInsert;
