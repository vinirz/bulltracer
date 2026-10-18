import type { Logger } from "pino";

import { notFound, validationError } from "../../../lib/errors.js";
import type { ConnectionRepository } from "../../connections/domain/ports.js";
import type { AlertRule, AlertRuleInput, Webhook, WebhookInput } from "../domain/entities.js";
import { ALERT_METRICS } from "../domain/entities.js";
import type { AlertRuleRepository, WebhookRepository } from "../domain/ports.js";

/**
 * Casos de uso de Alertas & Webhooks (CRUD + regras de integridade).
 *
 * A validação de `alert_rules` garante que: connection existe, webhook existe e
 * metricType é um dos suportados — falhas antecipadas aqui evitam webhooks
 * órfãos no Watcher.
 */
export class AlertsService {
  constructor(
    private readonly rules: AlertRuleRepository,
    private readonly webhooks: WebhookRepository,
    private readonly connections: ConnectionRepository,
    private readonly logger: Logger,
  ) {}

  private async assertWebhookExists(id: string): Promise<void> {
    if (!(await this.webhooks.findById(id))) {
      throw notFound("WEBHOOK_NOT_FOUND", `Webhook ${id} não encontrado`);
    }
  }

  private assertMetricType(metricType: string) {
    if (!ALERT_METRICS.includes(metricType as (typeof ALERT_METRICS)[number])) {
      throw validationError(
        "VALIDATION_FAILED",
        `metricType inválido. Valores válidos: ${ALERT_METRICS.join(", ")}`,
      );
    }
  }

  /* ---------- Webhooks ---------- */

  async listWebhooks(): Promise<Webhook[]> {
    return this.webhooks.findAll();
  }

  async getWebhook(id: string): Promise<Webhook> {
    const webhook = await this.webhooks.findById(id);
    if (!webhook) throw notFound("WEBHOOK_NOT_FOUND", `Webhook ${id} não encontrado`);
    return webhook;
  }

  /** Variante não-lançável — usada pelo Watcher no fluxo quente de eventos. */
  async getWebhookSafe(id: string): Promise<Webhook | null> {
    return this.webhooks.findById(id);
  }

  async createWebhook(input: WebhookInput): Promise<Webhook> {
    try {
      new URL(input.url);
    } catch {
      throw validationError("VALIDATION_FAILED", "URL do webhook inválida");
    }
    const created = await this.webhooks.create(input);
    this.logger.info({ webhookId: created.id, name: created.name }, "Webhook criado");
    return created;
  }

  async updateWebhook(id: string, input: Partial<WebhookInput>): Promise<Webhook> {
    if (input.url !== undefined) {
      try {
        new URL(input.url);
      } catch {
        throw validationError("VALIDATION_FAILED", "URL do webhook inválida");
      }
    }
    const updated = await this.webhooks.update(id, input);
    if (!updated) throw notFound("WEBHOOK_NOT_FOUND", `Webhook ${id} não encontrado`);
    return updated;
  }

  async removeWebhook(id: string): Promise<void> {
    const deleted = await this.webhooks.delete(id);
    if (!deleted) throw notFound("WEBHOOK_NOT_FOUND", `Webhook ${id} não encontrado`);
    this.logger.info({ webhookId: id }, "Webhook excluído");
  }

  /* ---------- Regras de alerta ---------- */

  async listAlertRules(): Promise<AlertRule[]> {
    return this.rules.findAll();
  }

  async getAlertRule(id: string): Promise<AlertRule> {
    const rule = await this.rules.findById(id);
    if (!rule) throw notFound("ALERT_RULE_NOT_FOUND", `Regra ${id} não encontrada`);
    return rule;
  }

  async createAlertRule(input: AlertRuleInput): Promise<AlertRule> {
    this.assertMetricType(input.metricType);
    await this.assertWebhookExists(input.webhookId);
    const connection = await this.connections.findById(input.connectionId);
    if (!connection) {
      throw notFound("CONNECTION_NOT_FOUND", `Conexão ${input.connectionId} não encontrada`);
    }
    const created = await this.rules.create(input);
    this.logger.info(
      { ruleId: created.id, queueName: created.queueName, metricType: created.metricType },
      "Regra de alerta criada",
    );
    return created;
  }

  async updateAlertRule(id: string, input: Partial<AlertRuleInput>): Promise<AlertRule> {
    if (input.metricType !== undefined) this.assertMetricType(input.metricType);
    if (input.webhookId !== undefined) await this.assertWebhookExists(input.webhookId);
    const updated = await this.rules.update(id, input);
    if (!updated) throw notFound("ALERT_RULE_NOT_FOUND", `Regra ${id} não encontrada`);
    return updated;
  }

  async removeAlertRule(id: string): Promise<void> {
    const deleted = await this.rules.delete(id);
    if (!deleted) throw notFound("ALERT_RULE_NOT_FOUND", `Regra ${id} não encontrada`);
  }

  /** Regras ativas de uma fila — usado pelo Watcher a cada evento. */
  async rulesForQueue(connectionId: string, queueName: string): Promise<AlertRule[]> {
    return this.rules.findByConnectionAndQueue(connectionId, queueName);
  }
}
