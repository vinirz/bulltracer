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

const T0 = 1_000_000;
const ctx = (event: "failed" | "active", at: number, extra: { waitTimeMs?: number; jobId?: string } = {}) => ({
  event,
  jobId: extra.jobId ?? "job",
  connectionId: "conn-1",
  queueName: "video",
  occurredAt: at,
  waitTimeMs: extra.waitTimeMs,
});

/** Dispara `n` falhas espaçadas de 100ms a partir de `from`; devolve todas as notificações. */
async function fail(evaluator: InMemoryRuleEvaluator, rules: AlertRule[], n: number, from = T0) {
  const all = [];
  for (let i = 0; i < n; i++) all.push(...(await evaluator.evaluate(rules, ctx("failed", from + i * 100))));
  return all;
}

/** Simula o ticker do Watcher: chama tick() a cada `step` ms e junta as notificações. */
function tickEvery(evaluator: InMemoryRuleEvaluator, from: number, to: number, step = 5_000) {
  const all = [];
  for (let t = from; t <= to; t += step) all.push(...evaluator.tick(t));
  return all;
}

describe("InMemoryRuleEvaluator — failed_jobs", () => {
  it("não notifica abaixo do limiar", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    expect(await fail(evaluator, [rule()], 4)).toHaveLength(0);
  });

  it("notifica UMA vez ao atingir o limiar (status firing)", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    const notifications = await fail(evaluator, [rule()], 5);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      ruleId: "rule-1",
      status: "firing",
      value: 5,
      threshold: 5,
      queueName: "video",
      webhookId: "wh-1",
      metricType: "failed_jobs",
    });
  });

  it("não repete a notificação enquanto as falhas passam do limiar (31, 32, 33…)", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    const notifications = await fail(evaluator, [rule({ threshold: 30 })], 60);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.value).toBe(30);
  });

  it("expira falhas fora da janela deslizante", async () => {
    const evaluator = new InMemoryRuleEvaluator({ failedJobsWindowMs: 60_000 });
    await fail(evaluator, [rule()], 4);
    const later = await evaluator.evaluate([rule()], ctx("failed", T0 + 61_000));
    expect(later).toHaveLength(0);
  });

  it("recupera (resolved) após a janela esvaziar e o tempo de recuperação", async () => {
    const evaluator = new InMemoryRuleEvaluator({ failedJobsWindowMs: 60_000, recoveryMs: 60_000 });
    await fail(evaluator, [rule()], 5);

    // Janela cheia (até ~60s) e depois 60s de calma: nada antes de ~2 min.
    expect(tickEvery(evaluator, T0, T0 + 110_000)).toHaveLength(0);

    const resolved = tickEvery(evaluator, T0 + 115_000, T0 + 180_000);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ ruleId: "rule-1", status: "resolved", value: 0 });
  });

  it("não 'pisca': voltar a violar antes de recuperar cancela a recuperação", async () => {
    const evaluator = new InMemoryRuleEvaluator({ failedJobsWindowMs: 60_000, recoveryMs: 60_000 });
    await fail(evaluator, [rule()], 5);
    expect(tickEvery(evaluator, T0, T0 + 90_000)).toHaveLength(0); // janela vazia, contando a calma

    // Nova rajada antes de completar os 60s de calma.
    const again = await fail(evaluator, [rule()], 5, T0 + 100_000);
    expect(again).toHaveLength(0); // continua o mesmo incidente: sem novo firing
    expect(tickEvery(evaluator, T0 + 105_000, T0 + 150_000)).toHaveLength(0); // não recuperou
  });

  it("após recuperar, um novo incidente notifica firing de novo", async () => {
    const evaluator = new InMemoryRuleEvaluator({ failedJobsWindowMs: 60_000, recoveryMs: 60_000 });
    await fail(evaluator, [rule()], 5);
    const resolved = tickEvery(evaluator, T0, T0 + 180_000);
    expect(resolved.map((n) => n.status)).toEqual(["resolved"]);

    const second = await fail(evaluator, [rule()], 5, T0 + 200_000);
    expect(second).toHaveLength(1);
    expect(second[0]?.status).toBe("firing");
  });

  it("lembra (reminder) a cada intervalo enquanto o alerta persiste", async () => {
    const evaluator = new InMemoryRuleEvaluator({ reminderMs: 900_000, recoveryMs: 60_000, failedJobsWindowMs: 60_000 });
    const rules = [rule()];
    await fail(evaluator, rules, 5);

    // Falhas contínuas mantêm a regra violada; o lembrete vence aos 15 min.
    for (let t = 10_000; t < 900_000; t += 10_000) {
      await fail(evaluator, rules, 5, T0 + t);
      expect(evaluator.tick(T0 + t)).toHaveLength(0);
    }
    // O lembrete vence 15 min depois do firing (que ocorreu em T0 + 400ms).
    const at = T0 + 900_400;
    await fail(evaluator, rules, 5, at);
    const reminders = evaluator.tick(at);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ status: "reminder", ruleId: "rule-1" });
    // O próximo só vence 15 min depois.
    expect(evaluator.tick(at + 1)).toHaveLength(0);
  });

  it("reminderMs = 0 desliga os lembretes", async () => {
    const evaluator = new InMemoryRuleEvaluator({ reminderMs: 0, recoveryMs: 60_000, failedJobsWindowMs: 60_000 });
    await fail(evaluator, [rule()], 5);
    for (let t = 10_000; t <= 3_600_000; t += 10_000) {
      await fail(evaluator, [rule()], 5, T0 + t);
      expect(evaluator.tick(T0 + t)).toHaveLength(0);
    }
  });

  it("regras da mesma fila e webhook têm contadores independentes", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    const rules = [rule({ id: "r-low", threshold: 3 }), rule({ id: "r-high", threshold: 6 })];
    const notifications = await fail(evaluator, rules, 6);
    expect(notifications.map((n) => [n.ruleId, n.value])).toEqual([
      ["r-low", 3],
      ["r-high", 6],
    ]);
  });

  it("forget descarta o estado: a regra recomeça como normal", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    await fail(evaluator, [rule()], 5);
    evaluator.forget("rule-1");
    expect(evaluator.tick(T0 + 10_000_000)).toHaveLength(0); // sem recuperação fantasma
    expect(await fail(evaluator, [rule()], 5, T0 + 200_000)).toHaveLength(1); // dispara de novo
  });

  it("ignora eventos que não são `failed` para failed_jobs", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    for (let i = 0; i < 20; i++) {
      expect(await evaluator.evaluate([rule({ threshold: 1 })], ctx("active", T0 + i))).toHaveLength(0);
    }
  });
});

describe("InMemoryRuleEvaluator — wait_time_exceeded", () => {
  const waitRule = rule({ id: "rule-wait", metricType: "wait_time_exceeded", threshold: 10_000 });

  it("notifica uma vez quando o job espera além do limiar", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    expect(await evaluator.evaluate([waitRule], ctx("active", T0, { waitTimeMs: 5_000 }))).toHaveLength(0);

    const first = await evaluator.evaluate([waitRule], ctx("active", T0 + 1, { waitTimeMs: 15_000 }));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ ruleId: "rule-wait", status: "firing", value: 15_000 });

    const second = await evaluator.evaluate([waitRule], ctx("active", T0 + 2, { waitTimeMs: 18_000 }));
    expect(second).toHaveLength(0); // mesmo incidente
  });

  it("recupera depois do tempo de recuperação sem novas violações", async () => {
    const evaluator = new InMemoryRuleEvaluator({ recoveryMs: 60_000 });
    await evaluator.evaluate([waitRule], ctx("active", T0, { waitTimeMs: 15_000 }));
    expect(evaluator.tick(T0 + 30_000)).toHaveLength(0);
    const resolved = evaluator.tick(T0 + 60_000);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ status: "resolved", ruleId: "rule-wait" });
  });

  it("só é avaliada no evento active", async () => {
    const evaluator = new InMemoryRuleEvaluator();
    const violations = await evaluator.evaluate([waitRule], ctx("failed", T0, { waitTimeMs: 99_000 }));
    expect(violations).toHaveLength(0);
  });
});
