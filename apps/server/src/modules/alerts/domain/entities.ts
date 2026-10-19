import type { AlertRuleRow, WebhookRow } from "../../../db/schema.js";

/** Métricas alertáveis suportadas pelo Watcher. */
export const ALERT_METRICS = ["failed_jobs", "wait_time_exceeded"] as const;
export type AlertMetricType = (typeof ALERT_METRICS)[number];

/** Estado de um alerta notificado: início do incidente, lembrete periódico ou recuperação. */
export type AlertStatus = "firing" | "reminder" | "resolved";

export interface Webhook {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  connectionId: string;
  queueName: string;
  metricType: AlertMetricType;
  threshold: number;
  webhookId: string;
}

export function toDomainWebhook(row: WebhookRow): Webhook {
  return { id: row.id, name: row.name, url: row.url, createdAt: row.createdAt };
}

export function toDomainAlertRule(row: AlertRuleRow): AlertRule {
  return {
    id: row.id,
    connectionId: row.connectionId,
    queueName: row.queueName,
    metricType: row.metricType,
    threshold: row.threshold,
    webhookId: row.webhookId,
  };
}

export interface WebhookInput {
  name: string;
  url: string;
}

export interface AlertRuleInput {
  connectionId: string;
  queueName: string;
  metricType: AlertMetricType;
  threshold: number;
  webhookId: string;
}
