import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../../db/client.js";
import { alertRules, webhooks, type AlertRuleRow, type WebhookRow } from "../../../db/schema.js";
import type {
  AlertRule,
  AlertRuleInput,
  Webhook,
  WebhookInput,
} from "../domain/entities.js";
import {
  toDomainAlertRule,
  toDomainWebhook,
} from "../domain/entities.js";
import type { AlertRuleRepository, WebhookRepository } from "../domain/ports.js";

export class DrizzleWebhookRepository implements WebhookRepository {
  constructor(private readonly db: AppDatabase) {}

  async findAll(): Promise<Webhook[]> {
    return this.db.select().from(webhooks).all().map(toDomainWebhook);
  }

  async findById(id: string): Promise<Webhook | null> {
    const row = this.db.select().from(webhooks).where(eq(webhooks.id, id)).get();
    return row ? toDomainWebhook(row as WebhookRow) : null;
  }

  async create(input: WebhookInput, now = new Date()): Promise<Webhook> {
    const row: WebhookRow = {
      id: randomUUID(),
      name: input.name,
      url: input.url,
      createdAt: now.toISOString(),
    };
    this.db.insert(webhooks).values(row).run();
    return toDomainWebhook(row);
  }

  async update(id: string, input: Partial<WebhookInput>): Promise<Webhook | null> {
    if (!(await this.findById(id))) return null;
    this.db.update(webhooks).set(input).where(eq(webhooks.id, id)).run();
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.db.delete(webhooks).where(eq(webhooks.id, id)).run().changes > 0;
  }
}

export class DrizzleAlertRuleRepository implements AlertRuleRepository {
  constructor(private readonly db: AppDatabase) {}

  async findAll(): Promise<AlertRule[]> {
    return this.db.select().from(alertRules).all().map(toDomainAlertRule);
  }

  async findByConnectionAndQueue(connectionId: string, queueName: string): Promise<AlertRule[]> {
    return this.db
      .select()
      .from(alertRules)
      .where(and(eq(alertRules.connectionId, connectionId), eq(alertRules.queueName, queueName)))
      .all()
      .map(toDomainAlertRule);
  }

  async findById(id: string): Promise<AlertRule | null> {
    const row = this.db.select().from(alertRules).where(eq(alertRules.id, id)).get();
    return row ? toDomainAlertRule(row as AlertRuleRow) : null;
  }

  async create(input: AlertRuleInput, _now = new Date()): Promise<AlertRule> {
    const row: AlertRuleRow = {
      id: randomUUID(),
      connectionId: input.connectionId,
      queueName: input.queueName,
      metricType: input.metricType,
      threshold: input.threshold,
      webhookId: input.webhookId,
    };
    this.db.insert(alertRules).values(row).run();
    return toDomainAlertRule(row);
  }

  async update(id: string, input: Partial<AlertRuleInput>): Promise<AlertRule | null> {
    if (!(await this.findById(id))) return null;
    this.db.update(alertRules).set(input).where(eq(alertRules.id, id)).run();
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.db.delete(alertRules).where(eq(alertRules.id, id)).run().changes > 0;
  }

  async deleteByConnection(connectionId: string): Promise<number> {
    return this.db.delete(alertRules).where(eq(alertRules.connectionId, connectionId)).run()
      .changes;
  }
}
