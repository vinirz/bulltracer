import { http } from "./client";
import type {
  ApiAlertRule,
  ApiAlertRuleInput,
  ApiConnection,
  ApiConnectionInput,
  ApiConnectionTestResult,
  ApiWebhook,
  ApiWebhookInput,
  ErrorGroupDto,
  HealthResponse,
  HeatmapCellDto,
  JobDetailDto,
  JobStatusParam,
  JobsPage,
  QueueMetricsResponse,
  QueueSnapshot,
} from "./types";

/** Funções de endpoint do servidor BullTracer. */
export const api = {
  health: () => http.get<HealthResponse>("/api/health"),

  // -- Conexões ---------------------------------------------------------------
  listConnections: () => http.get<ApiConnection[]>("/api/connections"),
  createConnection: (input: ApiConnectionInput) =>
    http.post<ApiConnection>("/api/connections", input),
  updateConnection: (id: string, input: Partial<ApiConnectionInput>) =>
    http.put<ApiConnection>(`/api/connections/${encodeURIComponent(id)}`, input),
  deleteConnection: (id: string) =>
    http.delete<void>(`/api/connections/${encodeURIComponent(id)}`),
  testConnection: (input: { host: string; port: number; password?: string; db?: number }) =>
    http.post<ApiConnectionTestResult>("/api/connections/test", input),

  // -- Filas e jobs (leitura direta do Redis) ----------------------------------
  listQueues: (connectionId: string) =>
    http.get<QueueSnapshot[]>(`/api/connections/${encodeURIComponent(connectionId)}/queues`),
  listJobs: (
    connectionId: string,
    queueName: string,
    params: { status?: JobStatusParam; page?: number; limit?: number } = {},
  ) => {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    return http.get<JobsPage>(
      `/api/connections/${encodeURIComponent(connectionId)}/queues/${encodeURIComponent(queueName)}/jobs?${query.toString()}`,
    );
  },
  getMetrics: (connectionId: string, queueName: string, range = 60) =>
    http.get<QueueMetricsResponse>(
      `/api/connections/${encodeURIComponent(connectionId)}/queues/${encodeURIComponent(queueName)}/metrics?range=${range}`,
    ),
  getHeatmap: (connectionId: string, queueName: string) =>
    http.get<HeatmapCellDto[]>(
      `/api/connections/${encodeURIComponent(connectionId)}/queues/${encodeURIComponent(queueName)}/heatmap`,
    ),
  getErrors: (connectionId: string, queueName: string) =>
    http.get<ErrorGroupDto[]>(
      `/api/connections/${encodeURIComponent(connectionId)}/queues/${encodeURIComponent(queueName)}/errors`,
    ),
  getJob: (connectionId: string, queueName: string, jobId: string) =>
    http.get<JobDetailDto>(
      `/api/connections/${encodeURIComponent(connectionId)}/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}`,
    ),

  // -- Webhooks ---------------------------------------------------------------
  listWebhooks: () => http.get<ApiWebhook[]>("/api/webhooks"),
  createWebhook: (input: ApiWebhookInput) => http.post<ApiWebhook>("/api/webhooks", input),
  updateWebhook: (id: string, input: Partial<ApiWebhookInput>) =>
    http.put<ApiWebhook>(`/api/webhooks/${encodeURIComponent(id)}`, input),
  deleteWebhook: (id: string) => http.delete<void>(`/api/webhooks/${encodeURIComponent(id)}`),

  // -- Regras de alerta --------------------------------------------------------
  listAlertRules: () => http.get<ApiAlertRule[]>("/api/alerts"),
  createAlertRule: (input: ApiAlertRuleInput) =>
    http.post<ApiAlertRule>("/api/alerts", input),
  updateAlertRule: (id: string, input: Partial<ApiAlertRuleInput>) =>
    http.put<ApiAlertRule>(`/api/alerts/${encodeURIComponent(id)}`, input),
  deleteAlertRule: (id: string) => http.delete<void>(`/api/alerts/${encodeURIComponent(id)}`),
};
