/**
 * Contrato de tipos da API do servidor BullTracer
 * (espelha o dominio do servidor).
 */

/** Conexão Redis como persistida no SQLite do servidor. */
export interface ApiConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  password?: string;
  db: number;
  createdAt: string;
}

export interface ApiConnectionInput {
  name: string;
  host: string;
  port: number;
  password?: string;
  db?: number;
}

/** Resultado do teste de conexão executado pelo servidor (POST /api/connections/test). */
export interface ApiConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

/** Snapshot de contadores de uma fila lido direto do Redis (BullMQ). */
export interface QueueSnapshot {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export type JobStatusParam = "waiting" | "active" | "completed" | "failed" | "delayed";

/** Job do histórico BullMQ (jamais persistido no SQLite — Dupla Fonte de Verdade). */
export interface JobListItem {
  id: string;
  name: string;
  data: Record<string, unknown>;
  opts: unknown;
  failedReason: string | null;
  timestamp: number;
  attemptsMade: number;
}

export interface JobsPage {
  status: JobStatusParam;
  page: number;
  limit: number;
  total: number;
  items: JobListItem[];
}

export interface ApiWebhook {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface ApiWebhookInput {
  name: string;
  url: string;
}

/** Métricas alertáveis suportadas pelo Watcher do servidor. */
export type ApiAlertMetricType = "failed_jobs" | "wait_time_exceeded";

export interface ApiAlertRule {
  id: string;
  connectionId: string;
  queueName: string;
  metricType: ApiAlertMetricType;
  threshold: number;
  webhookId: string;
}

export interface ApiAlertRuleInput {
  connectionId: string;
  queueName: string;
  metricType: ApiAlertMetricType;
  threshold: number;
  webhookId: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

/** Evento broadcast pelo servidor via WebSocket em /ws. */
export interface BullmqEventMessage {
  type: "BULLMQ_EVENT";
  queue: string;
  event: "added" | "active" | "completed" | "failed";
  data: { jobId: string };
}

// -- Métricas, heatmap, erros e detalhe de job (leitura direta do Redis) ------

/** Ponto de uma série temporal de 5 em 5 minutos. */
export interface MetricPointDto {
  timeLabel: string;
  jobs: number;
  failures: number;
  throughput: number;
  waitTimeMs: number | null;
  processTimeMs: number | null;
  failureRate: number;
}

export interface QueueMetricsResponse {
  rangeMinutes: number;
  /** "jobs": calculado dos jobs existentes; "events": do stream de eventos (fila remove jobs concluídos). */
  source: "jobs" | "events";
  /** Stream de eventos cheio: o histórico mais antigo já foi aparado pelo BullMQ. */
  truncated: boolean;
  /** Status de job que a fila mantém no Redis; os demais não aparecem na UI. */
  retention: { completed: boolean; failed: boolean };
  points: MetricPointDto[];
  summary: {
    throughput: number;
    /** `null` quando indisponível (jobs concluídos removidos). */
    waitTimeMs: number | null;
    processTimeMs: number | null;
    queuePressure: number;
  };
}

/** Célula do heatmap (dia da semana × hora). */
export interface HeatmapCellDto {
  day: number;
  hour: number;
  volume: number;
  failureRate: number;
}

/** Grupo de erro com a mesma assinatura normalizada. */
export interface ErrorGroupDto {
  signature: string;
  count: number;
  percentage: number;
  jobIds: string[];
}

/** Detalhe completo de um job (inspector). */
export interface JobDetailDto {
  id: string;
  name: string;
  data: Record<string, unknown>;
  opts: unknown;
  failedReason: string | null;
  stacktrace: string[];
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  attemptsMade: number;
  attempts: number;
}
