import type { JobType } from "bullmq";
import type { Logger } from "pino";

import { ApplicationError, notFound, redisUnreachable } from "../../../lib/errors.js";
import type { RedisConnection } from "../domain/entities.js";
import type { ConnectionRepository } from "../domain/ports.js";
import type { RedisManager } from "../infrastructure/redis-manager.js";
import {
  eventsToTimings,
  parseFinishedEvents,
  retainsCompletedJobs,
  sampleEvenly,
  type FinishedEvent,
  type StreamEntry,
} from "./event-stream.js";
import {
  aggregateErrors,
  aggregateHeatmap,
  aggregateMetrics,
  HEATMAP_WINDOW_DAYS,
  METRIC_BUCKET_MINUTES,
  METRIC_POINTS,
  type ErrorGroup,
  type HeatmapCell,
  type JobTimings,
  type MetricPoint,
} from "./metrics-aggregation.js";

/** Origem dos números de uma métrica: jobs existentes no Redis ou o stream de eventos do BullMQ. */
export type MetricsSource = "jobs" | "events";

const EVENTS_BATCH = 1000;
const EVENTS_MAX = 20_000;
const RETENTION_SAMPLE = 30;
const ERRORS_WINDOW_MS = 14 * 24 * 60 * 60_000;

/**
 * Casos de uso de inspeção de filas — leitura DIRETA do Redis (BullMQ).
 *
 * A "Dupla Fonte de Verdade" dita que NENHUM dado de job toca o SQLite:
 * contadores, snapshots e históricos são resolvidos aqui, sob demanda,
 * através da API do BullMQ (`queue.getJobCounts`, `queue.getJobs`).
 */
export class QueueInspectionService {
  constructor(
    private readonly connections: ConnectionRepository,
    private readonly redis: RedisManager,
    private readonly logger: Logger,
  ) {}

  private async resolveConnection(connectionId: string): Promise<RedisConnection> {
    const connection = await this.connections.findById(connectionId);
    if (!connection) throw notFound("CONNECTION_NOT_FOUND", `Conexão ${connectionId} não encontrada`);
    return connection;
  }

  /** Descobre as filas do Redis alvo via SCAN nas chaves BullMQ (`bull:<name>:*`). */
  async discoverQueues(connectionId: string, prefix = "bull"): Promise<string[]> {
    const connection = await this.resolveConnection(connectionId);
    const client = this.redis.getClient(connection);
    try {
      const queueNames = new Set<string>();
      const stream = client.scanStream({ match: `${prefix}:*`, count: 500 });
      for await (const keys of stream) {
        for (const key of keys as string[]) {
          const match = key.match(new RegExp(`^${prefix}:([^:]+):`));
          if (match?.[1]) queueNames.add(match[1]);
        }
      }
      const names = [...queueNames];
      this.logger.debug(
        { connectionId, count: names.length },
        "Filas descobertas no Redis alvo",
      );
      return names;
    } catch (error) {
      throw redisUnreachable(`Não foi possível conectar em ${connection.host}:${connection.port}`, error);
    }
  }

  /** Snapshot de contadores de uma fila (waiting, active, completed, failed, delayed). */
  async getQueueSnapshot(connectionId: string, queueName: string) {
    const connection = await this.resolveConnection(connectionId);
    try {
      const queue = this.redis.getQueue(connection, queueName);
      const counts = await queue.getJobCounts();
      return { queueName, ...counts };
    } catch (error) {
      throw redisUnreachable(`Falha ao ler a fila "${queueName}"`, error);
    }
  }

  /** Histórico paginado de jobs — extraído do Redis, jamais persistido. */
  async getJobs(
    connectionId: string,
    queueName: string,
    params: { status: JobType; page: number; limit: number },
  ) {
    const connection = await this.resolveConnection(connectionId);
    const page = Math.max(1, params.page);
    const limit = Math.min(100, Math.max(1, params.limit));
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    try {
      const queue = this.redis.getQueue(connection, queueName);
      const [jobs, total] = await Promise.all([
        queue.getJobs([params.status], start, end),
        queue.getJobCountByTypes(params.status),
      ]);
      return {
        status: params.status,
        page,
        limit,
        total,
        items: jobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          opts: job.opts,
          failedReason: job.failedReason ?? null,
          timestamp: job.timestamp,
          attemptsMade: job.attemptsMade,
        })),
      };
    } catch (error) {
      throw redisUnreachable(`Falha ao ler jobs da fila "${queueName}"`, error);
    }
  }

  /** Detalhe completo de um job — dados, opções, stacktrace e tempos brutos do Redis. */
  async getJob(connectionId: string, queueName: string, jobId: string) {
    const connection = await this.resolveConnection(connectionId);
    try {
      const queue = this.redis.getQueue(connection, queueName);
      const job = await queue.getJob(jobId);
      if (!job) throw notFound("JOB_NOT_FOUND", `Job ${jobId} não encontrado na fila "${queueName}"`);
      return {
        id: job.id,
        name: job.name,
        data: job.data,
        opts: job.opts,
        failedReason: job.failedReason ?? null,
        stacktrace: job.stacktrace ?? [],
        timestamp: job.timestamp,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        attemptsMade: job.attemptsMade,
        attempts: typeof job.opts?.attempts === "number" ? job.opts.attempts : 1,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw redisUnreachable(`Falha ao ler o job ${jobId} da fila "${queueName}"`, error);
    }
  }

  /** Eventos `completed`/`failed` do stream da fila desde `sinceMs` (leitura direta, com teto). */
  private async readFinishedEvents(
    connection: RedisConnection,
    queueName: string,
    sinceMs: number,
  ): Promise<{ events: FinishedEvent[]; truncated: boolean }> {
    const client = this.redis.getClient(connection);
    const key = `bull:${queueName}:events`;
    const entries: StreamEntry[] = [];
    let start = `${Math.max(0, Math.floor(sinceMs))}-0`;
    while (entries.length < EVENTS_MAX) {
      const batch = (await client.xrange(key, start, "+", "COUNT", EVENTS_BATCH)) as StreamEntry[];
      if (batch.length === 0) break;
      entries.push(...batch);
      const [ms, seq] = (batch[batch.length - 1] as StreamEntry)[0].split("-");
      start = `${ms}-${Number(seq) + 1}`;
      if (batch.length < EVENTS_BATCH) break;
    }
    const maxLen = Number(await client.hget(`bull:${queueName}:meta`, "opts.maxLenEvents")) || 10_000;
    const total = await client.xlen(key);
    // Stream cheio: as entradas mais antigas já foram aparadas pelo BullMQ.
    return { events: parseFinishedEvents(entries), truncated: total >= maxLen };
  }

  /** A fila mantém os jobs concluídos? Confere no Redis uma amostra espalhada pela janela. */
  private async retainsJobs(
    connection: RedisConnection,
    queueName: string,
    events: FinishedEvent[],
  ): Promise<boolean> {
    const completed = events.filter((e) => e.event === "completed" && e.jobId);
    if (completed.length === 0) return true; // nada a inferir: usa o que existir
    const sample = sampleEvenly(completed, RETENTION_SAMPLE);
    const client = this.redis.getClient(connection);
    const found = await Promise.all(sample.map((e) => client.exists(`bull:${queueName}:${e.jobId}`)));
    return retainsCompletedJobs(found.reduce<number>((acc, n) => acc + n, 0), sample.length);
  }

  /** Escolhe a origem: jobs existentes quando a fila os retém; senão, o stream de eventos. */
  private async resolveSource(connection: RedisConnection, queueName: string, sinceMs: number) {
    const { events, truncated } = await this.readFinishedEvents(connection, queueName, sinceMs);
    const source: MetricsSource = (await this.retainsJobs(connection, queueName, events)) ? "jobs" : "events";
    return { source, events, truncated };
  }

  /** Extrai o mínimo temporal dos jobs BullMQ para as agregações (sem payloads). */
  private toTimings(jobs: { id?: string; timestamp: number; processedOn?: number | null; finishedOn?: number | null; failedReason?: string | null }[]): JobTimings[] {
    return jobs.map((job) => ({
      id: job.id,
      timestamp: job.timestamp,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
      failedReason: job.failedReason ?? null,
    }));
  }

  /**
   * Séries de 5 em 5 minutos (12 pontos = 1h) de throughput, espera e
   * processamento. Quando a fila retém os jobs concluídos, os números vêm dos
   * jobs (com tempos de espera/processamento); quando os remove
   * (`removeOnComplete`), vêm do stream de eventos e os tempos ficam `null`.
   */
  async getMetrics(
    connectionId: string,
    queueName: string,
    rangeMinutes = 60,
  ): Promise<{
    rangeMinutes: number;
    source: MetricsSource;
    truncated: boolean;
    /** Status de job que a fila mantém no Redis (a UI esconde o que não existe). */
    retention: { completed: boolean; failed: boolean };
    points: MetricPoint[];
    summary: {
      throughput: number;
      waitTimeMs: number | null;
      processTimeMs: number | null;
      queuePressure: number;
    };
  }> {
    const connection = await this.resolveConnection(connectionId);
    const now = Date.now();
    const windowMs = Math.max(rangeMinutes, METRIC_BUCKET_MINUTES * METRIC_POINTS) * 60_000;
    try {
      const queue = this.redis.getQueue(connection, queueName);
      const { source, events, truncated } = await this.resolveSource(connection, queueName, now - windowMs);

      let timings: JobTimings[];
      if (source === "events") {
        timings = eventsToTimings(events);
      } else {
        const limit = Math.min(1000, Math.max(200, Math.ceil((rangeMinutes / 5) * 60)));
        timings = this.toTimings(await queue.getJobs(["completed", "failed"], 0, limit));
      }
      const counts = await queue.getJobCounts();

      const points = aggregateMetrics(timings, now);
      const windowJobs = timings.filter((job) => (job.finishedOn ?? job.timestamp) >= now - rangeMinutes * 60_000);
      const windowSeconds = Math.max(1, rangeMinutes * 60);
      const avg = (values: number[]) =>
        values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
      const wait = windowJobs.map((j) => (j.processedOn && j.timestamp ? j.processedOn - j.timestamp : null)).filter((v): v is number => v !== null);
      const process = windowJobs.map((j) => (j.processedOn && j.finishedOn ? j.finishedOn - j.processedOn : null)).filter((v): v is number => v !== null);
      const waiting = counts.waiting ?? 0;
      const active = counts.active ?? 0;
      const queuePressure = waiting + active > 0
        ? Math.min(100, Math.round((waiting / Math.max(1, waiting + active)) * 100))
        : 0;
      return {
        rangeMinutes,
        source,
        truncated,
        retention: {
          completed: source === "jobs",
          // Falhas no stream sem nenhum job falho no Redis: a fila usa `removeOnFail`.
          failed: !(events.some((e) => e.event === "failed") && (counts.failed ?? 0) === 0),
        },
        points,
        summary: {
          throughput: Number((windowJobs.length / windowSeconds).toFixed(2)),
          waitTimeMs: source === "events" ? null : Math.round(avg(wait)),
          processTimeMs: source === "events" ? null : Math.round(avg(process)),
          queuePressure,
        },
      };
    } catch (error) {
      throw redisUnreachable(`Falha ao computar métricas da fila "${queueName}"`, error);
    }
  }

  /** Heatmap 7×24 (volume e taxa de falha por dia-da-semana/hora), últimos 14 dias. */
  async getHeatmap(connectionId: string, queueName: string, timeZone = "UTC"): Promise<HeatmapCell[]> {
    const connection = await this.resolveConnection(connectionId);
    try {
      const { source, events } = await this.resolveSource(connection, queueName, Date.now() - HEATMAP_WINDOW_DAYS * 24 * 60 * 60_000);
      if (source === "events") return aggregateHeatmap(eventsToTimings(events), Date.now(), timeZone);
      const queue = this.redis.getQueue(connection, queueName);
      const jobs = await queue.getJobs(["completed", "failed"], 0, 1000);
      return aggregateHeatmap(this.toTimings(jobs), Date.now(), timeZone);
    } catch (error) {
      throw redisUnreachable(`Falha ao computar heatmap da fila "${queueName}"`, error);
    }
  }

  /** Agrupamento de falhas por assinatura da mensagem, para o card "Agrupamento de Erros". */
  async getErrors(connectionId: string, queueName: string): Promise<ErrorGroup[]> {
    const connection = await this.resolveConnection(connectionId);
    try {
      const queue = this.redis.getQueue(connection, queueName);
      const failedJobs = await queue.getJobs(["failed"], 0, 500);
      this.logger.debug({ connectionId, queueName, failed: failedJobs.length }, "Agrupamento de erros da fila");
      if (failedJobs.length > 0) return aggregateErrors(this.toTimings(failedJobs));
      // Falhas removidas (`removeOnFail`): recupera as razões do stream de eventos.
      const { events } = await this.readFinishedEvents(connection, queueName, Date.now() - ERRORS_WINDOW_MS);
      return aggregateErrors(eventsToTimings(events.filter((e) => e.event === "failed")));
    } catch (error) {
      throw redisUnreachable(`Falha ao agrupar erros da fila "${queueName}"`, error);
    }
  }
}
