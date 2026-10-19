import type { AlertRule } from "../../alerts/domain/entities.js";
import type {
  EvaluationContext,
  RuleEvaluator,
  RuleViolation,
} from "../domain/events.js";

export interface RuleEvaluatorOptions {
  /** Janela deslizante de `failed_jobs` (ms). */
  failedJobsWindowMs?: number;
  /** Intervalo entre lembretes de um alerta ainda ativo (ms); 0 desliga. */
  reminderMs?: number;
  /** Tempo contínuo sem violação para declarar recuperação (ms) — evita "piscar" perto do limiar. */
  recoveryMs?: number;
}

/** Estado de uma regra em alerta. Regras normais não têm entrada. */
interface AlertState {
  rule: AlertRule;
  lastViolationAt: number;
  lastNotifiedAt: number;
  lastValue: number;
}

/**
 * Avaliador de regras de alerta com estado por regra (em memória).
 *
 * Notifica apenas nas MUDANÇAS de estado, não a cada evento:
 *   normal → em alerta   `firing`    (1 notificação por incidente)
 *   em alerta            `reminder`  (a cada `reminderMs`, se ainda violada)
 *   em alerta → normal   `resolved`  (após `recoveryMs` sem violação)
 *
 * - `failed_jobs`: conta falhas na janela deslizante; viola com contagem >= limiar.
 * - `wait_time_exceeded`: avaliada no evento `active`; viola quando o job
 *   esperou `threshold` ms ou mais.
 *
 * `evaluate()` reage a eventos; `tick()` trata a passagem do tempo (a
 * recuperação não gera evento algum — as falhas simplesmente param).
 * Nada é persistido: a Dupla Fonte de Verdade é mantida.
 */
export class InMemoryRuleEvaluator implements RuleEvaluator {
  private readonly failureTimes = new Map<string, number[]>(); // por regra
  private readonly states = new Map<string, AlertState>();
  private readonly failedJobsWindowMs: number;
  private readonly reminderMs: number;
  private readonly recoveryMs: number;

  constructor(options: RuleEvaluatorOptions = {}) {
    this.failedJobsWindowMs = options.failedJobsWindowMs ?? 60_000;
    this.reminderMs = options.reminderMs ?? 15 * 60_000;
    this.recoveryMs = options.recoveryMs ?? 60_000;
  }

  async evaluate(rules: AlertRule[], ctx: EvaluationContext): Promise<RuleViolation[]> {
    const notifications: RuleViolation[] = [];

    for (const rule of rules) {
      let value: number | null = null;

      if (rule.metricType === "failed_jobs") {
        if (ctx.event !== "failed") continue;
        const count = this.trackFailure(rule.id, ctx.occurredAt);
        if (count >= rule.threshold) value = count;
      } else if (rule.metricType === "wait_time_exceeded") {
        if (ctx.event !== "active" || ctx.waitTimeMs === undefined) continue;
        if (ctx.waitTimeMs >= rule.threshold) value = ctx.waitTimeMs;
      }

      if (value === null) continue;
      const state = this.states.get(rule.id);
      if (state) {
        // Já em alerta: só renova o estado, sem notificar.
        state.rule = rule;
        state.lastViolationAt = ctx.occurredAt;
        state.lastValue = value;
      } else {
        this.states.set(rule.id, {
          rule,
          lastViolationAt: ctx.occurredAt,
          lastNotifiedAt: ctx.occurredAt,
          lastValue: value,
        });
        notifications.push(this.notification(rule, "firing", value));
      }
    }

    return notifications;
  }

  tick(now: number): RuleViolation[] {
    const notifications: RuleViolation[] = [];

    for (const [ruleId, state] of this.states) {
      const { rule } = state;

      // A janela de falhas esvazia com o tempo: reavalia a contagem atual.
      if (rule.metricType === "failed_jobs") {
        const count = this.windowCount(ruleId, now);
        if (count >= rule.threshold) {
          state.lastViolationAt = now;
          state.lastValue = count;
        }
      }

      if (now - state.lastViolationAt >= this.recoveryMs) {
        const value = rule.metricType === "failed_jobs" ? this.windowCount(ruleId, now) : state.lastValue;
        notifications.push(this.notification(rule, "resolved", value));
        this.states.delete(ruleId);
        this.failureTimes.delete(ruleId);
      } else if (this.reminderMs > 0 && now - state.lastNotifiedAt >= this.reminderMs) {
        state.lastNotifiedAt = now;
        notifications.push(this.notification(rule, "reminder", state.lastValue));
      }
    }

    return notifications;
  }

  forget(ruleId: string): void {
    this.states.delete(ruleId);
    this.failureTimes.delete(ruleId);
  }

  private notification(rule: AlertRule, status: RuleViolation["status"], value: number): RuleViolation {
    return {
      ruleId: rule.id,
      connectionId: rule.connectionId,
      queueName: rule.queueName,
      webhookId: rule.webhookId,
      metricType: rule.metricType,
      status,
      value,
      threshold: rule.threshold,
    };
  }

  /** Registra uma falha e devolve quantas ocorreram na janela. Contador próprio por regra. */
  private trackFailure(ruleId: string, now: number): number {
    const timestamps = this.failureTimes.get(ruleId) ?? [];
    timestamps.push(now);
    this.failureTimes.set(ruleId, timestamps);
    return this.windowCount(ruleId, now);
  }

  private windowCount(ruleId: string, now: number): number {
    const timestamps = this.failureTimes.get(ruleId);
    if (!timestamps) return 0;
    const cutoff = now - this.failedJobsWindowMs;
    const inWindow = timestamps.filter((t) => t >= cutoff);
    if (inWindow.length === 0) this.failureTimes.delete(ruleId);
    else this.failureTimes.set(ruleId, inWindow);
    return inWindow.length;
  }
}
