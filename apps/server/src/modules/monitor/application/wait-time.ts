/** Campos do job BullMQ necessários para calcular o tempo de espera. */
export interface WaitTimeSource {
  timestamp: number;
  processedOn?: number;
  attemptsMade: number;
  opts?: { delay?: number };
}

/**
 * Tempo que o job esperou na fila até um worker pegá-lo (ms).
 *
 * - Parte de `timestamp + delay`: jobs agendados não "esperam" durante o delay.
 * - Considera só a primeira tentativa (`attemptsMade === 0`): em retentativas
 *   o job volta à fila e o `timestamp` original inflaria a espera.
 *
 * Retorna `null` quando a espera não é mensurável.
 */
export function computeWaitTimeMs(job: WaitTimeSource, now: number): number | null {
  if (job.attemptsMade > 0) return null;
  const startedAt = job.processedOn ?? now;
  const readyAt = job.timestamp + (job.opts?.delay ?? 0);
  return Math.max(0, startedAt - readyAt);
}
