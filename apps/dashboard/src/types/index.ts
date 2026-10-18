export type ConnectionStatus = "connected" | "disconnected" | "connecting";

export interface RedisConnection {
  id: string;
  name: string;
  environment: "production" | "staging" | "development";
  host: string;
  port: number;
  username?: string;
  password?: string;
  status: ConnectionStatus;
  queueCount: number;
}

export type QueueHealth = "healthy" | "warning" | "critical";

export interface QueueMetrics {
  /** Jobs processados por segundo. */
  throughput: number;
  /** Tempo médio de espera na fila antes do processamento, em ms. */
  waitTimeMs: number;
  /** Tempo médio de execução do worker, em ms. */
  processTimeMs: number;
  /** Pressão da fila: jobs em espera / vazão atual, em percentual (0-100+). */
  queuePressure: number;
}

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueSummary {
  name: string;
  connectionId: string;
  health: QueueHealth;
  counts: QueueCounts;
  metrics: QueueMetrics;
}

export type JobStatus = "waiting" | "active" | "completed" | "failed" | "delayed";

export interface JobRecord {
  id: string;
  queueName: string;
  processName: string;
  status: JobStatus;
  attemptsMade: number;
  attemptsMax: number;
  ageMs: number;
  createdAt: string;
  opts: {
    attempts: number;
    backoff?: { type: string; delay: number };
    timeout?: number;
    slaTimeoutMs?: number;
  };
  data: Record<string, unknown>;
  failedReason?: string;
  stacktrace?: string[];
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

/**
 * Regra de alerta — modelo do servidor BullTracer.
 *
 * A regra é avaliada pelo Watcher do backend (eventos `failed`/`wait_time_exceeded`
 * sobre o Redis), que dispara o webhook associado ao cruzar o limiar.
 */
export type AlertMetricType = "failed_jobs" | "wait_time_exceeded";

export interface AlertRule {
  id: string;
  connectionId: string;
  queueName: string;
  metricType: AlertMetricType;
  threshold: number;
  webhookId: string;
}
