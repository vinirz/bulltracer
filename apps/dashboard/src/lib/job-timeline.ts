import type { JobStatus } from "@/types";

/** Marco no tempo (evento) ou intervalo entre dois marcos (duração). */
export type TimelineStep =
  | { kind: "event"; label: string; at: number; tone?: "default" | "success" | "danger" }
  | { kind: "duration"; label: string; ms: number };

export interface TimelineInput {
  status: JobStatus;
  /** Epoch ms da criação do job (`job.timestamp`). */
  timestamp: number;
  processedOn?: number | null;
  finishedOn?: number | null;
  /** Atraso agendado (`opts.delay`), em ms. */
  delayMs?: number;
  now: number;
}

/**
 * Linha do tempo de um job: adicionado → espera → início → execução → fim.
 * A espera desconta o `delay` agendado. O BullMQ só guarda os tempos da última tentativa.
 */
export function buildJobTimeline({ status, timestamp, processedOn, finishedOn, delayMs = 0, now }: TimelineInput): TimelineStep[] {
  const steps: TimelineStep[] = [{ kind: "event", label: "Adicionado em", at: timestamp }];
  const readyAt = timestamp + delayMs;

  if (status === "delayed") {
    steps.push({ kind: "event", label: "Agendado para", at: readyAt });
    return steps;
  }

  if (status === "waiting" || !processedOn) {
    steps.push({ kind: "duration", label: "Aguardando há", ms: Math.max(0, now - readyAt) });
    return steps;
  }

  steps.push({ kind: "duration", label: "Esperou", ms: Math.max(0, processedOn - readyAt) });
  steps.push({ kind: "event", label: "Processo iniciado em", at: processedOn });

  if (status === "active" || !finishedOn) {
    steps.push({ kind: "duration", label: "Em execução há", ms: Math.max(0, now - processedOn) });
    return steps;
  }

  steps.push({ kind: "duration", label: "Executou por", ms: Math.max(0, finishedOn - processedOn) });
  steps.push(
    status === "failed"
      ? { kind: "event", label: "Falhou em", at: finishedOn, tone: "danger" }
      : { kind: "event", label: "Concluído em", at: finishedOn, tone: "success" },
  );
  return steps;
}
