import type { AlertRule } from "../../alerts/domain/entities.js";
import type {
  EvaluationContext,
  RuleEvaluator,
  RuleViolation,
} from "../domain/events.js";

/**
 * Avaliador de regras de alerta (estado em memória + janela deslizante).
 *
 * - `failed_jobs`: o evento `failed` incrementa um contador deslizante de
 *   janela (FAILED_JOBS_WINDOW_MS). A regra é violada quando o número de
 *   falhas na janela atinge o threshold. O contador não persiste nada além
 *   da memória — a Dupla Fonte de Verdade é mantida.
 * - `wait_time_exceeded`: viola quando o job esperou mais que `threshold`
 *   (em ms). O wait time vem do Job (processedOn - timestamp) através do ctx.
 */
export class InMemoryRuleEvaluator implements RuleEvaluator {
  private readonly failedCounts = new Map<string, number[]>();

  constructor(private readonly failedJobsWindowMs = 60_000) {}

  async evaluate(
    rules: AlertRule[],
    ctx: EvaluationContext,
  ): Promise<RuleViolation[]> {
    const violations: RuleViolation[] = [];

    for (const rule of rules) {
      if (rule.metricType === "failed_jobs") {
        if (ctx.event !== "failed") continue;
        const bucketKey = `${rule.connectionId}:${rule.queueName}:${rule.webhookId}`;
        const value = this.trackFailure(bucketKey, ctx.occurredAt);
        if (value >= rule.threshold) {
          violations.push({
            ruleId: rule.id,
            metricType: rule.metricType,
            value,
            threshold: rule.threshold,
          });
        }
      } else if (rule.metricType === "wait_time_exceeded") {
        if (ctx.waitTimeMs === undefined) continue;
        const value = ctx.waitTimeMs;
        if (value >= rule.threshold) {
          violations.push({
            ruleId: rule.id,
            metricType: rule.metricType,
            value,
            threshold: rule.threshold,
          });
        }
      }
    }

    return violations;
  }

  private trackFailure(key: string, now: number): number {
    const timestamps = this.failedCounts.get(key) ?? [];
    timestamps.push(now);
    const cutoff = now - this.failedJobsWindowMs;
    const filtered = timestamps.filter((t) => t >= cutoff);
    this.failedCounts.set(key, filtered);
    return filtered.length;
  }
}
