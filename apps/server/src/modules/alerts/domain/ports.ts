import type { AlertRule, AlertRuleInput, Webhook, WebhookInput } from "./entities.js";

/** Contrato de persistência de webhooks (implementado com Drizzle). */
export interface WebhookRepository {
  findAll(): Promise<Webhook[]>;
  findById(id: string): Promise<Webhook | null>;
  create(input: WebhookInput, now?: Date): Promise<Webhook>;
  update(id: string, input: Partial<WebhookInput>): Promise<Webhook | null>;
  delete(id: string): Promise<boolean>;
}

/** Contrato de persistência de regras de alerta (implementado com Drizzle). */
export interface AlertRuleRepository {
  findAll(): Promise<AlertRule[]>;
  findByConnectionAndQueue(connectionId: string, queueName: string): Promise<AlertRule[]>;
  findById(id: string): Promise<AlertRule | null>;
  create(input: AlertRuleInput, now?: Date): Promise<AlertRule>;
  update(id: string, input: Partial<AlertRuleInput>): Promise<AlertRule | null>;
  delete(id: string): Promise<boolean>;
  deleteByConnection(connectionId: string): Promise<number>;
}
