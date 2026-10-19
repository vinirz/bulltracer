import { EventEmitter } from "node:events";

import { InMemoryRuleEvaluator } from "../../src/modules/monitor/application/in-memory-rule-evaluator.js";
import { Watcher } from "../../src/modules/monitor/application/watcher.js";
import type { AlertRule } from "../../src/modules/alerts/domain/entities.js";

const connection = { id: "conn-1", name: "c", host: "h", port: 6379, db: 0, createdAt: "" };

function waitRule(threshold: number): AlertRule {
  return {
    id: "rule-wait",
    connectionId: "conn-1",
    queueName: "video",
    metricType: "wait_time_exceeded",
    threshold,
    webhookId: "wh-1",
  };
}

function setup(rules: AlertRule[], job: Record<string, unknown> | undefined) {
  const events = Object.assign(new EventEmitter(), {
    waitUntilReady: () => Promise.resolve(),
  });
  const getJob = jest.fn().mockResolvedValue(job);
  const redisManager = {
    getQueueEvents: () => events,
    getQueue: () => ({ getJob }),
    closeQueueEvents: jest.fn().mockResolvedValue(undefined),
    disposeEventClient: jest.fn().mockResolvedValue(undefined),
  };
  const alertsService = {
    rulesForQueue: jest.fn().mockResolvedValue(rules),
    getWebhookSafe: jest.fn().mockResolvedValue({ id: "wh-1", url: "http://hook.test" }),
  };
  const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const sink = { broadcast: jest.fn() };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  const watcher = new Watcher(
    redisManager as never,
    alertsService as never,
    dispatcher as never,
    new InMemoryRuleEvaluator(),
    sink as never,
    logger as never,
  );
  return { watcher, events, getJob, dispatcher, sink };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("Watcher — wait_time_exceeded", () => {
  it("dispara webhook quando o job esperou além do threshold", async () => {
    const now = Date.now();
    const { watcher, events, dispatcher } = setup([waitRule(5_000)], {
      timestamp: now - 12_000,
      processedOn: now,
      attemptsMade: 0,
      opts: {},
    });
    await watcher.watch(connection, "video");
    events.emit("active", { jobId: "42", prev: "waiting" });
    await flush();

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatch.mock.calls[0][1]).toMatchObject({
      ruleId: "rule-wait",
      metricType: "wait_time_exceeded",
      threshold: 5_000,
    });
  });

  it("não dispara quando a espera está dentro do limite", async () => {
    const now = Date.now();
    const { watcher, events, dispatcher } = setup([waitRule(5_000)], {
      timestamp: now - 1_000,
      processedOn: now,
      attemptsMade: 0,
      opts: {},
    });
    await watcher.watch(connection, "video");
    events.emit("active", { jobId: "42" });
    await flush();

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("não consulta o Redis quando a fila não tem regra de espera", async () => {
    const { watcher, events, getJob } = setup([], undefined);
    await watcher.watch(connection, "video");
    events.emit("active", { jobId: "42" });
    await flush();

    expect(getJob).not.toHaveBeenCalled();
  });

  it("segue sem alertar se o job já foi removido do Redis", async () => {
    const { watcher, events, dispatcher } = setup([waitRule(1)], undefined);
    await watcher.watch(connection, "video");
    events.emit("active", { jobId: "42" });
    await flush();

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("continua transmitindo o evento via WebSocket", async () => {
    const { watcher, events, sink } = setup([], undefined);
    await watcher.watch(connection, "video");
    events.emit("active", { jobId: "42" });
    await flush();

    expect(sink.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "BULLMQ_EVENT", event: "active", queue: "video" }),
    );
  });
});
