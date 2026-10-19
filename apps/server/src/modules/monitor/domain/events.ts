/**
 * Contratos do domínio de monitoramento reativo.
 *
 * O Watcher consome o stream global de eventos de cada fila BullMQ
 * (`QueueEvents`) e emite DOIS efeitos colaterais:
 *   1. broadcast WebSocket (payload tipado abaixo);
 *   2. avaliação de regras de alerta com disparo assíncrono de webhooks.
 */

import type { AlertStatus } from "../../alerts/domain/entities.js";

/** Eventos do BullMQ que o dashboard observa (stream global da fila). */
export type BullMqEventType = "added" | "active" | "completed" | "failed";

/** Payload do broadcast WebSocket. Ex.: { type: 'BULLMQ_EVENT', queue: 'video', event: 'failed', data: { jobId: '123' } }. */
export interface BullMqEventMessage {
  type: "BULLMQ_EVENT";
  connectionId: string;
  queue: string;
  event: BullMqEventType;
  data: Record<string, unknown>;
}

/** Assinatura do Pub/Sub de notificações para o frontend. */
export interface NotificationSink {
  broadcast(message: BullMqEventMessage): void;
}

/** Contexto de um evento para a avaliação de regras. */
export interface EvaluationContext {
  event: BullMqEventType;
  jobId: string;
  connectionId: string;
  queueName: string;
  occurredAt: number;
  /** Tempo de espera do job (ms) — usado por `wait_time_exceeded`. */
  waitTimeMs?: number;
}

/**
 * Notificação de alerta emitida pelo avaliador: uma mudança de estado da regra
 * (`firing` ao cruzar o limiar, `reminder` enquanto persiste, `resolved` ao
 * recuperar) — nunca uma por evento.
 */
export interface RuleViolation {
  ruleId: string;
  connectionId: string;
  queueName: string;
  webhookId: string;
  metricType: string;
  status: AlertStatus;
  value: number;
  threshold: number;
}

/**
 * Contrato de avaliação de regras. Mantém o estado de cada regra
 * (normal ↔ em alerta) para notificar só nas transições.
 */
export interface RuleEvaluator {
  /** Avalia um evento da fila; devolve notificações `firing` (transição normal → alerta). */
  evaluate(
    rules: import("../../alerts/domain/entities.js").AlertRule[],
    ctx: EvaluationContext,
  ): Promise<RuleViolation[]>;
  /** Passagem do tempo: devolve `resolved` (recuperou) e `reminder` (segue em alerta). */
  tick(now: number): RuleViolation[];
  /** Descarta o estado de uma regra (removida ou alterada). */
  forget(ruleId: string): void;
}
