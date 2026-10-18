import { InMemoryRuleEvaluator } from "../../src/modules/monitor/application/in-memory-rule-evaluator.js";
import type { AlertRule } from "../../src/modules/alerts/domain/entities.js";

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    connectionId: "conn-1",
    queueName: "video",
    metricType: "failed_jobs",
    threshold: 5,
    webhookId: "wh-1",
    ...overrides,
  };
}

describe("InMemoryRuleEvaluator", () => {
  const now = Date.now();
  const baseCtx = {
    event: "failed" as const,
    jobId: "job-1",
    connectionId: "conn-1",
    queueName: "video",
    occurredAt: now,
  };

  it("não viola regra failed_jobs abaixo do threshold", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    const violations = await evaluator.evaluate([rule()], baseCtx);
    expect(violations).toHaveLength(0);
  });

  it("viola regra failed_jobs quando o threshold é atingido na janela", async () => {
    const evaluator = new InMemoryRuleEvaluator(60_000);
    const ctxFor = (index: number) => ({ ...baseCtx, jobId: `job-${index}`, occurredAt: now + index * 1000 });

    // 5 falhas em 4s — quinta ultrapassa o threshold 5.
    let violations: Awaited<ReturnType<typeof evaluator.evaluate>> = [];
    for (let i = 0; i < 5; i++) {
      violations = await evaluator.evaluate([rule()], ctxFor(i));
    }
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ ruleId: "rule-1", value: 5, threshold: 5 });
  });

  it("expira falhas fora da janela (janela deslizante)", async () => {
    const evaluator = new InMemoryRuleEvaluator(60_000);
    // 4 falhas agora, depois uma 5ª após 61s — a janela só vê 1 falha.
    for (let i = 0; i < 4; i++) {
      await evaluator.evaluate([rule()], { ...baseCtx, jobId: `job-old-${i}` });
    }
    const violations = await evaluator.evaluate([rule()], {
      ...baseCtx,
      jobId: "job-new",
      occurredAt: now + 61_000,
    });
    expect(violations).toHaveLength(0);
  });

  it("viola regra wait_time_exceeded quando o job esperou além do threshold", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    const rules = [
      rule({ id: "rule-wait", metricType: "wait_time_exceeded", threshold: 10_000 }),
    ];
    const ok = await evaluator.evaluate(rules, { ...baseCtx, waitTimeMs: 5_000 });
    expect(ok).toHaveLength(0);

    const violado = await evaluator.evaluate(rules, { ...baseCtx, jobId: 'job-slow', waitTimeMs: 15_000 });
    expect(violado).toHaveLength(1);
    expect(violado[0]).toMatchObject({ ruleId: "rule-wait", value: 15_000 });
  });

  it("regras de outros tipos de evento não disparam failed_jobs", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    const violations = await evaluator.evaluate([rule()], { ...baseCtx, event: "completed" });
    expect(violations).toHaveLength(0);
  });
});
