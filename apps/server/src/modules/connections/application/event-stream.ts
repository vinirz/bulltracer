/**
 * Leitura pura do stream de eventos do BullMQ (`bull:<fila>:events`).
 *
 * Quando a fila usa `removeOnComplete`, os jobs concluídos somem do Redis, mas
 * o stream guarda `completed`/`failed` (limitado por `maxLenEvents`). Aqui o
 * stream é convertido em `JobTimings` para reaproveitar as agregações.
 * Sem I/O — o QueueInspectionService faz as leituras no Redis.
 */
import type { JobTimings } from "./metrics-aggregation.js";

/** Entrada crua do XRANGE: `[id, [campo, valor, campo, valor, ...]]`. */
export type StreamEntry = [id: string, fields: string[]];

export interface FinishedEvent {
  /** Epoch ms extraído do ID da entrada (`<ms>-<seq>`). */
  at: number;
  event: "completed" | "failed";
  jobId: string;
  failedReason?: string;
}

/** Fração mínima de jobs `completed` amostrados que ainda existem para considerar que a fila os retém. */
export const RETENTION_THRESHOLD = 0.9;

export function parseFinishedEvents(entries: StreamEntry[]): FinishedEvent[] {
  const finished: FinishedEvent[] = [];
  for (const [id, fields] of entries) {
    const data: Record<string, string> = {};
    for (let i = 0; i + 1 < fields.length; i += 2) data[fields[i] as string] = fields[i + 1] as string;
    if (data.event !== "completed" && data.event !== "failed") continue;
    const at = Number(id.split("-")[0]);
    if (!Number.isFinite(at)) continue;
    finished.push({
      at,
      event: data.event,
      jobId: data.jobId ?? "",
      failedReason: data.event === "failed" ? data.failedReason || "unknown" : undefined,
    });
  }
  return finished;
}

/** Cada evento final vira um "job" já finalizado; não há tempos de espera/processamento. */
export function eventsToTimings(events: FinishedEvent[]): JobTimings[] {
  return events.map((e) => ({
    id: e.jobId,
    timestamp: e.at,
    processedOn: null,
    finishedOn: e.at,
    failedReason: e.event === "failed" ? e.failedReason : null,
  }));
}

/** Até `n` itens espaçados por toda a lista (cobre a janela inteira, não só os mais recentes). */
export function sampleEvenly<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)] as T);
}

/** A fila retém os jobs concluídos quando (quase) toda a amostra ainda existe no Redis. */
export function retainsCompletedJobs(existing: number, sampled: number): boolean {
  return sampled > 0 && existing / sampled >= RETENTION_THRESHOLD;
}
