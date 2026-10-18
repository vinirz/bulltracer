/**
 * Contratos do domínio de monitoramento reativo.
 *
 * O Watcher consome o stream global de eventos de cada fila BullMQ
 * (`QueueEvents`) e emite DOIS efeitos colaterais:
 *   1. broadcast WebSocket (payload tipado abaixo);
 *   2. avaliação de regras de alerta com disparo assíncrono de webhooks.
 */

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

/** Resultado de uma avaliação: regra violada + valor observado. */
export interface RuleViolation {
  ruleId: string;
  metricType: string;
  value: number;
  threshold: number;
}

/** Contrato de avaliação de regras: decide se um evento deve disparar alerta. */
export interface RuleEvaluator {
  evaluate(
    rules: import("../../alerts/domain/entities.js").AlertRule[],
    ctx: EvaluationContext,
  ): Promise<RuleViolation[]>;
}
