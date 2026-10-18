import type {
  AlertRule,
  JobRecord,
  QueueSummary,
  RedisConnection,
  Webhook,
} from "@/types";

export const mockConnections: RedisConnection[] = [
  {
    id: "conn-prod",
    name: "Produção",
    environment: "production",
    host: "redis-prod.internal",
    port: 6379,
    status: "connected",
    queueCount: 3,
  },
  {
    id: "conn-staging",
    name: "Staging",
    environment: "staging",
    host: "redis-staging.internal",
    port: 6379,
    status: "connected",
    queueCount: 2,
  },
];

export const mockQueues: QueueSummary[] = [
  {
    name: "send-notifications",
    connectionId: "conn-prod",
    health: "healthy",
    counts: { waiting: 12, active: 4, completed: 18420, failed: 23, delayed: 2 },
    metrics: {
      throughput: 45,
      waitTimeMs: 120,
      processTimeMs: 310,
      queuePressure: 18,
    },
  },
  {
    name: "process-payments",
    connectionId: "conn-prod",
    health: "warning",
    counts: { waiting: 86, active: 6, completed: 9231, failed: 41, delayed: 0 },
    metrics: {
      throughput: 12,
      waitTimeMs: 4200,
      processTimeMs: 1500,
      queuePressure: 72,
    },
  },
  {
    name: "generate-reports",
    connectionId: "conn-prod",
    health: "critical",
    counts: { waiting: 214, active: 2, completed: 1032, failed: 97, delayed: 15 },
    metrics: {
      throughput: 2.5,
      waitTimeMs: 15800,
      processTimeMs: 8600,
      queuePressure: 94,
    },
  },
  {
    name: "sync-inventory",
    connectionId: "conn-staging",
    health: "healthy",
    counts: { waiting: 3, active: 1, completed: 540, failed: 1, delayed: 0 },
    metrics: {
      throughput: 8,
      waitTimeMs: 95,
      processTimeMs: 210,
      queuePressure: 9,
    },
  },
  {
    name: "email-digest",
    connectionId: "conn-staging",
    health: "warning",
    counts: { waiting: 47, active: 3, completed: 2201, failed: 12, delayed: 4 },
    metrics: {
      throughput: 6,
      waitTimeMs: 3100,
      processTimeMs: 900,
      queuePressure: 65,
    },
  },
];

const longFailedReason = `QueryFailedError: duplicate key value violates unique constraint "payments_pkey"
    at PostgresQueryRunner.query (/app/node_modules/typeorm/driver/postgres/PostgresQueryRunner.js:219:19)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async PaymentsRepository.insertTransaction (/app/src/payments/payments.repository.ts:42:7)
    at async PaymentsWorker.process (/app/src/payments/payments.worker.ts:18:5)`;

export const mockJobs: JobRecord[] = [
  {
    id: "1001",
    queueName: "send-notifications",
    processName: "SEND_EMAIL",
    status: "completed",
    attemptsMade: 1,
    attemptsMax: 3,
    ageMs: 1000 * 60 * 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    opts: { attempts: 3, slaTimeoutMs: 5000 },
    data: { to: "user@example.com", template: "welcome" },
  },
  {
    id: "1002",
    queueName: "send-notifications",
    processName: "SEND_PUSH",
    status: "active",
    attemptsMade: 1,
    attemptsMax: 3,
    ageMs: 1000 * 8,
    createdAt: new Date(Date.now() - 1000 * 8).toISOString(),
    opts: { attempts: 3, slaTimeoutMs: 5000 },
    data: { deviceId: "a1b2c3", message: "Seu pedido foi enviado!" },
  },
  {
    id: "1003",
    queueName: "process-payments",
    processName: "CHARGE_CARD",
    status: "failed",
    attemptsMade: 3,
    attemptsMax: 3,
    ageMs: 1000 * 60 * 14,
    createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      slaTimeoutMs: 8000,
    },
    data: { orderId: "ORD-93221", amount: 149.9, currency: "BRL" },
    failedReason: 'duplicate key value violates unique constraint "payments_pkey"',
    stacktrace: longFailedReason.split("\n"),
  },
  {
    id: "1004",
    queueName: "process-payments",
    processName: "REFUND",
    status: "waiting",
    attemptsMade: 0,
    attemptsMax: 3,
    ageMs: 1000 * 60 * 3,
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    opts: { attempts: 3, slaTimeoutMs: 8000 },
    data: { orderId: "ORD-93540", amount: 59.9 },
  },
  {
    id: "1005",
    queueName: "generate-reports",
    processName: "BUILD_PDF",
    status: "failed",
    attemptsMade: 2,
    attemptsMax: 2,
    ageMs: 1000 * 60 * 40,
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    opts: { attempts: 2, slaTimeoutMs: 30000 },
    data: { reportId: "RPT-2291", range: "2026-09" },
    failedReason: "Hard Kill: job excedeu o slaTimeoutMs de 30000ms",
    stacktrace: [
      "Error: Hard Kill: job excedeu o slaTimeoutMs de 30000ms",
      "    at TracedWorker.runWithSlaGuard (/app/node_modules/@bulltracer/core/dist/index.cjs:75:13)",
    ],
  },
  {
    id: "1006",
    queueName: "generate-reports",
    processName: "BUILD_PDF",
    status: "delayed",
    attemptsMade: 0,
    attemptsMax: 2,
    ageMs: 1000 * 60 * 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
    opts: { attempts: 2, slaTimeoutMs: 30000 },
    data: { reportId: "RPT-2292", range: "2026-10" },
  },
  {
    id: "1007",
    queueName: "sync-inventory",
    processName: "SYNC_SKU",
    status: "completed",
    attemptsMade: 1,
    attemptsMax: 2,
    ageMs: 1000 * 60 * 5,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    opts: { attempts: 2 },
    data: { sku: "SKU-4471", quantity: 120 },
  },
  {
    id: "1008",
    queueName: "email-digest",
    processName: "SEND_DIGEST",
    status: "failed",
    attemptsMade: 3,
    attemptsMax: 3,
    ageMs: 1000 * 60 * 25,
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    opts: { attempts: 3, slaTimeoutMs: 10000 },
    data: { userId: "u-7781", period: "weekly" },
    failedReason: "SMTP connection timeout",
    stacktrace: [
      "Error: SMTP connection timeout",
      "    at SMTPConnection._formatError (/app/node_modules/nodemailer/lib/smtp-connection/index.js:787:19)",
    ],
  },
];

// Preenche a lista até 60 jobs variados para popular a tabela e o agrupamento
// de erros da Tela 4.
const statuses: JobRecord["status"][] = [
  "waiting",
  "active",
  "completed",
  "completed",
  "failed",
];

const failureReasonPools: Record<string, string[]> = {
  "process-payments": [
    'duplicate key value violates unique constraint "payments_pkey"',
    "Timeout ao consultar o gateway de pagamento",
    "Constraint de saldo insuficiente violada",
  ],
  "generate-reports": [
    "Hard Kill: job excedeu o slaTimeoutMs de 30000ms",
    "JavaScript heap out of memory",
  ],
  "email-digest": [
    "SMTP connection timeout",
    "Erro ao renderizar template de e-mail",
  ],
  "send-notifications": [
    "Provedor de push indisponível (503)",
    "Timeout ao enviar notificação",
  ],
  "sync-inventory": ["Conflito de versão ao sincronizar SKU"],
};

function pickFailureReason(queueName: string, index: number): string {
  const pool = failureReasonPools[queueName] ?? ["Erro genérico de processamento"];
  return pool[index % pool.length];
}

for (let i = mockJobs.length + 1; i <= 60; i++) {
  const status = statuses[i % statuses.length];
  const queue = mockQueues[i % mockQueues.length];
  mockJobs.push({
    id: String(1000 + i),
    queueName: queue.name,
    processName: "GENERIC_TASK",
    status,
    attemptsMade: status === "failed" ? 3 : 1,
    attemptsMax: 3,
    ageMs: 1000 * 60 * i,
    createdAt: new Date(Date.now() - 1000 * 60 * i).toISOString(),
    opts: { attempts: 3, slaTimeoutMs: 10000 },
    data: { index: i, sample: true },
    failedReason: status === "failed" ? pickFailureReason(queue.name, i) : undefined,
  });
}

// Série temporal mockada (últimos 12 pontos, ~1 ponto a cada 5min) de throughput
// por fila, usada no gráfico unificado da Tela 1.
export interface ThroughputPoint {
  timeLabel: string;
  [queueName: string]: number | string;
}

export function buildThroughputSeries(queues: QueueSummary[]): ThroughputPoint[] {
  const points = 12;
  const series: ThroughputPoint[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const minutesAgo = i * 5;
    const point: ThroughputPoint = {
      timeLabel: minutesAgo === 0 ? "agora" : `-${minutesAgo}min`,
    };
    for (const queue of queues) {
      const noise = Math.sin(i * 1.3 + queue.name.length) * 0.18 + 1;
      const value = Math.max(0, queue.metrics.throughput * noise);
      point[queue.name] = Number(value.toFixed(1));
    }
    series.push(point);
  }
  return series;
}

// Série temporal mockada (últimos 12 pontos) de latência total (espera +
// processamento) por fila, no mesmo formato do gráfico de throughput.
export interface LatencyPoint {
  timeLabel: string;
  [queueName: string]: number | string;
}

export function buildLatencySeries(queues: QueueSummary[]): LatencyPoint[] {
  const points = 12;
  const series: LatencyPoint[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const minutesAgo = i * 5;
    const point: LatencyPoint = {
      timeLabel: minutesAgo === 0 ? "agora" : `-${minutesAgo}min`,
    };
    for (const queue of queues) {
      const noise = Math.cos(i * 1.1 + queue.name.length) * 0.2 + 1;
      const value = Math.max(0, (queue.metrics.waitTimeMs + queue.metrics.processTimeMs) * noise);
      point[queue.name] = Math.round(value);
    }
    series.push(point);
  }
  return series;
}

// Gera uma matriz determinística 7x24 (dia da semana x hora) com volume de
// jobs e taxa de falha estimada, usada no heatmap de picos da aba Detalhes.
export interface HeatmapCell {
  day: number;
  hour: number;
  volume: number;
  failureRate: number;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildHeatmapData(queueName: string, health: QueueSummary["health"]): HeatmapCell[] {
  const random = mulberry32(hashString(queueName));
  const baseFailureRate = health === "critical" ? 18 : health === "warning" ? 8 : 2;
  const cells: HeatmapCell[] = [];

  for (let day = 0; day < 7; day++) {
    const isWeekend = day === 0 || day === 6;
    for (let hour = 0; hour < 24; hour++) {
      const isBusinessHour = hour >= 8 && hour <= 19;
      const base = isWeekend ? 10 : isBusinessHour ? 70 : 25;
      const volume = Math.max(0, Math.round(base * (0.6 + random() * 0.8)));
      const failureRate = Math.max(
        0,
        Math.min(100, baseFailureRate * (0.5 + random() * 1.5) + (isBusinessHour ? 2 : 0)),
      );
      cells.push({ day, hour, volume, failureRate: Number(failureRate.toFixed(1)) });
    }
  }
  return cells;
}

export const mockWebhooks: Webhook[] = [
  {
    id: "wh-1",
    name: "Slack #infra-alerts",
    url: "https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
  },
  {
    id: "wh-2",
    name: "PagerDuty On-call",
    url: "https://events.pagerduty.com/v2/enqueue",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
];

export const mockAlertRules: AlertRule[] = [
  {
    id: "alert-1",
    connectionId: "conn-prod",
    queueName: "process-payments",
    metricType: "failed_jobs",
    threshold: 50,
    webhookId: "wh-1",
  },
  {
    id: "alert-2",
    connectionId: "conn-prod",
    queueName: "generate-reports",
    metricType: "failed_jobs",
    threshold: 25,
    webhookId: "wh-2",
  },
  {
    id: "alert-3",
    connectionId: "conn-staging",
    queueName: "email-digest",
    metricType: "wait_time_exceeded",
    threshold: 120_000,
    webhookId: "wh-1",
  },
  {
    id: "alert-4",
    connectionId: "conn-prod",
    queueName: "send-notifications",
    metricType: "wait_time_exceeded",
    threshold: 60_000,
    webhookId: "wh-2",
  },
];
