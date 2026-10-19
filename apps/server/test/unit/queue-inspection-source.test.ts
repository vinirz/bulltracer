import { QueueInspectionService } from "../../src/modules/connections/application/queue-inspection-service.js";

const connection = { id: "c1", name: "c", host: "h", port: 6379, db: 0, createdAt: "" };
const now = Date.now();

type Ev = [string, string[]];
const completedEvent = (i: number): Ev => [`${now - 60_000 + i * 1000}-0`, ["event", "completed", "jobId", String(i)]];
const failedEvent = (i: number, reason: string): Ev => [`${now - 30_000 + i * 1000}-0`, ["event", "failed", "jobId", `f${i}`, "failedReason", reason]];

/** Redis falso: stream de eventos + quais chaves de job existem + jobs devolvidos por getJobs. */
function build(opts: { events: Ev[]; existingJobIds: string[]; completedJobs?: unknown[]; failedJobs?: unknown[] }) {
  const client = {
    xrange: jest.fn(),
    xlen: jest.fn(async () => opts.events.length),
    hget: jest.fn(async () => null),
    exists: jest.fn(async (key: string) => (opts.existingJobIds.includes(key.split(":")[2] as string) ? 1 : 0)),
  };
  // xrange devolve o lote uma vez; as chamadas seguintes (a partir do último ID) retornam vazio.
  client.xrange.mockResolvedValueOnce(opts.events).mockResolvedValue([]);
  const queue = {
    getJobs: jest.fn(async (types: string[]) => (types.includes("failed") && types.length === 1 ? opts.failedJobs ?? [] : opts.completedJobs ?? [])),
    getJobCounts: jest.fn(async () => ({ waiting: 0, active: 0 })),
  };
  const redis = { getClient: () => client, getQueue: () => queue };
  const repo = { findById: async () => connection };
  const logger = { debug: jest.fn() };
  return { service: new QueueInspectionService(repo as never, redis as never, logger as never), queue };
}

describe("origem das métricas (jobs vs. eventos)", () => {
  const events = [0, 1, 2, 3, 4].map(completedEvent);

  it("usa o stream de eventos quando a fila remove os jobs concluídos", async () => {
    const { service, queue } = build({ events, existingJobIds: [] });
    const m = await service.getMetrics("c1", "q");
    expect(m.source).toBe("events");
    expect(queue.getJobs).not.toHaveBeenCalled();
    expect(m.points.reduce((acc, p) => acc + p.jobs, 0)).toBe(5);
    expect(m.summary.waitTimeMs).toBeNull();
    expect(m.summary.processTimeMs).toBeNull();
    expect(m.retention.completed).toBe(false);
  });

  it("usa os jobs existentes quando a fila os retém", async () => {
    const jobs = events.map((e) => ({
      id: e[0],
      timestamp: now - 61_000,
      processedOn: now - 60_000,
      finishedOn: now - 59_000,
      failedReason: undefined,
    }));
    const { service, queue } = build({
      events,
      existingJobIds: ["0", "1", "2", "3", "4"],
      completedJobs: jobs,
    });
    const m = await service.getMetrics("c1", "q");
    expect(m.source).toBe("jobs");
    expect(queue.getJobs).toHaveBeenCalled();
    expect(m.summary.waitTimeMs).toBe(1000);
    expect(m.summary.processTimeMs).toBe(1000);
    expect(m.retention).toEqual({ completed: true, failed: true });
  });

  it("marca falhas como não retidas quando há eventos failed mas nenhum job falho", async () => {
    const { service } = build({ events: [...events, failedEvent(0, "boom")], existingJobIds: [] });
    expect((await service.getMetrics("c1", "q")).retention.failed).toBe(false);
  });

  it("sem eventos no stream, cai para os jobs existentes", async () => {
    const { service } = build({ events: [], existingJobIds: [] });
    expect((await service.getMetrics("c1", "q")).source).toBe("jobs");
  });

  it("conta falhas pelo stream quando os jobs foram removidos", async () => {
    const { service } = build({ events: [...events, failedEvent(0, "boom 1"), failedEvent(1, "boom 2")], existingJobIds: [] });
    const m = await service.getMetrics("c1", "q");
    expect(m.points.reduce((acc, p) => acc + p.failures, 0)).toBe(2);
  });
});

describe("agrupamento de erros", () => {
  it("recupera os motivos do stream quando não há jobs falhos", async () => {
    const { service } = build({
      events: [failedEvent(0, "timeout 30"), failedEvent(1, "timeout 45"), failedEvent(2, "outro erro")],
      existingJobIds: [],
    });
    const groups = await service.getErrors("c1", "q");
    expect(groups[0]).toMatchObject({ signature: "timeout <n>", count: 2 });
  });
});

describe("getJob", () => {
  it("inclui o estado atual e os instantes do job", async () => {
    const job = {
      id: "7",
      name: "t",
      data: {},
      opts: { attempts: 3 },
      failedReason: "boom",
      stacktrace: ["Error: boom\n    at x (/a.js:1:2)"],
      timestamp: 100,
      processedOn: 150,
      finishedOn: 170,
      attemptsMade: 1,
      getState: async () => "failed",
    };
    const redis = { getClient: () => ({}), getQueue: () => ({ getJob: async () => job }) };
    const service = new QueueInspectionService({ findById: async () => connection } as never, redis as never, { debug: jest.fn() } as never);
    const detail = await service.getJob("c1", "q", "7");
    expect(detail).toMatchObject({ state: "failed", processedOn: 150, finishedOn: 170, attempts: 3 });
    expect(detail.stacktrace).toHaveLength(1);
  });
});
