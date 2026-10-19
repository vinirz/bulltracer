/**
 * Agregações puras das séries de monitoramento — sem I/O, 100% testáveis.
 *
 * Recebem apenas os timestamps/dados mínimos dos jobs (extraídos do Redis
 * pelo QueueInspectionService) e devolvem as séries que o dashboard renderiza.
 * Nenhuma função aqui toca SQLite, Redis ou rede: é a camada de cálculo puro.
 */

export interface JobTimings {
  /** ID do job (usado no agrupamento de erros). */
  id?: string;
  /** Epoch ms da criação do job (BullMQ `job.timestamp`). */
  timestamp: number;
  /** Epoch ms do início do processamento (`job.processedOn`). */
  processedOn?: number | null;
  /** Epoch ms do fim do processamento (`job.finishedOn`). */
  finishedOn?: number | null;
  /** Mensagem de erro quando o job falhou (`job.failedReason`). */
  failedReason?: string | null;
}

export const METRIC_BUCKET_MINUTES = 5;
export const METRIC_POINTS = 12;
export const HEATMAP_WINDOW_DAYS = 14;

export interface MetricPoint {
  timeLabel: string;
  jobs: number;
  failures: number;
  /** Jobs finalizados por segundo no bucket (janela de 5 min). */
  throughput: number;
  /** Espera média no bucket, em ms (null quando não há amostras). */
  waitTimeMs: number | null;
  /** Processamento médio no bucket, em ms (null quando não há amostras). */
  processTimeMs: number | null;
  /** Taxa de falha no bucket, em %. */
  failureRate: number;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Agrupa os jobs em janelas de 5 minutos terminando em `now`, da mais antiga
 * para a mais recente. Um job entra no bucket pelo seu `finishedOn` (ou
 * `timestamp` quando ainda não terminou).
 */
export function aggregateMetrics(
  jobs: JobTimings[],
  now = Date.now(),
  points = METRIC_POINTS,
): MetricPoint[] {
  const bucketMs = METRIC_BUCKET_MINUTES * 60_000;
  const series: MetricPoint[] = [];

  for (let i = points - 1; i >= 0; i--) {
    const bucketEnd = now - i * bucketMs;
    const bucketStart = bucketEnd - bucketMs;
    const inBucket = jobs.filter((job) => {
      const at = job.finishedOn ?? job.timestamp;
      return at >= bucketStart && at < bucketEnd;
    });
    const failuresCount = inBucket.filter((job) => job.failedReason).length;

    const waitTimes: number[] = [];
    const processTimes: number[] = [];
    for (const job of inBucket) {
      if (job.timestamp && job.processedOn) waitTimes.push(job.processedOn - job.timestamp);
      if (job.processedOn && job.finishedOn) processTimes.push(job.finishedOn - job.processedOn);
    }

    series.push({
      timeLabel: i === 0 ? "agora" : `-${i * METRIC_BUCKET_MINUTES}min`,
      jobs: inBucket.length,
      failures: failuresCount,
      throughput: Number((inBucket.length / (bucketMs / 1000)).toFixed(2)),
      waitTimeMs: average(waitTimes),
      processTimeMs: average(processTimes),
      failureRate:
        inBucket.length === 0 ? 0 : Number(((failuresCount / inBucket.length) * 100).toFixed(1)),
    });
  }
  return series;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

/** Fuso IANA válido (ex.: "America/Sao_Paulo")? */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Dia da semana (0 = Dom) e hora (0–23) de um instante, no fuso informado. */
export function zonedDayHour(epochMs: number, timeZone: string): { day: number; hour: number } {
  let formatter = zonedFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" });
    zonedFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(epochMs);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  return { day: WEEKDAY_INDEX[weekday] ?? 0, hour };
}

export interface HeatmapCell {
  /** 0 = Domingo … 6 = Sábado. */
  day: number;
  hour: number;
  volume: number;
  failureRate: number;
}

/**
 * Distribuição de volume e taxa de falha por (dia da semana, hora), contada
 * sobre o `timestamp` dos jobs na janela dos últimos 14 dias, no fuso `timeZone`
 * (UTC por padrão — o cliente informa o seu para ver os horários locais).
 * Células sem nenhum job são omitidas — o frontend as pinta como vazias.
 */
export function aggregateHeatmap(
  jobs: JobTimings[],
  now = Date.now(),
  timeZone = "UTC",
): HeatmapCell[] {
  const byCell = new Map<string, { volume: number; failures: number }>();
  const cutoff = now - HEATMAP_WINDOW_DAYS * 24 * 60 * 60_000;

  for (const job of jobs) {
    if (job.timestamp < cutoff) continue; // descarta fora da janela
    const { day, hour } = zonedDayHour(job.timestamp, timeZone);
    const key = `${day}-${hour}`;
    const cell = byCell.get(key) ?? { volume: 0, failures: 0 };
    cell.volume += 1;
    if (job.failedReason) cell.failures += 1;
    byCell.set(key, cell);
  }

  return [...byCell.entries()]
    .map(([key, cell]) => {
      const [dayStr, hourStr] = key.split("-");
      const day = Number(dayStr ?? "0");
      const hour = Number(hourStr ?? "0");
      return {
        day,
        hour,
        volume: cell.volume,
        failureRate:
          cell.volume === 0 ? 0 : Number(((cell.failures / cell.volume) * 100).toFixed(1)),
      };
    })
    .sort((a, b) => a.day - b.day || a.hour - b.hour);
}

export interface ErrorGroup {
  signature: string;
  count: number;
  percentage: number;
  jobIds: string[];
}

/** Normaliza a mensagem de erro removendo valores variáveis (ids, números). */
export function normalizeSignature(reason: string): string {
  return (reason.split("\n")[0] ?? "")
    .replace(/["'][\w.-]+["']/g, "<valor>")
    .replace(/\b\d+\b/g, "<n>")
    .trim();
}

/** Agrupa falhas pela assinatura normalizada da mensagem, mais frequentes primeiro. */
export function aggregateErrors(jobs: JobTimings[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();

  for (const job of jobs) {
    if (!job.failedReason) continue;
    const signature = normalizeSignature(job.failedReason);
    const existing = groups.get(signature);
    if (existing) {
      existing.count += 1;
      if (job.id) existing.jobIds.push(job.id);
    } else {
      groups.set(signature, {
        signature,
        count: 1,
        percentage: 0,
        jobIds: job.id ? [job.id] : [],
      });
    }
  }

  const total = [...groups.values()].reduce((acc, g) => acc + g.count, 0) || 1;
  return [...groups.values()]
    .map((group) => ({
      ...group,
      percentage: Number(((group.count / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);
}
