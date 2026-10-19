import {
  eventsToTimings,
  parseFinishedEvents,
  retainsCompletedJobs,
  sampleEvenly,
  type StreamEntry,
} from "../../src/modules/connections/application/event-stream.js";

const entry = (id: string, ...fields: string[]): StreamEntry => [id, fields];

describe("parseFinishedEvents", () => {
  it("extrai completed/failed e o horário do ID da entrada", () => {
    const events = parseFinishedEvents([
      entry("1000-0", "event", "added", "jobId", "1"),
      entry("2000-0", "event", "completed", "jobId", "1", "returnvalue", "null"),
      entry("3000-1", "event", "failed", "jobId", "2", "failedReason", "boom 42"),
      entry("4000-0", "event", "drained"),
    ]);
    expect(events).toEqual([
      { at: 2000, event: "completed", jobId: "1", failedReason: undefined },
      { at: 3000, event: "failed", jobId: "2", failedReason: "boom 42" },
    ]);
  });

  it("usa 'unknown' quando a falha não traz motivo", () => {
    const [e] = parseFinishedEvents([entry("1-0", "event", "failed", "jobId", "9")]);
    expect(e?.failedReason).toBe("unknown");
  });

  it("ignora entradas com ID inválido", () => {
    expect(parseFinishedEvents([entry("x-0", "event", "completed", "jobId", "1")])).toEqual([]);
  });
});

describe("eventsToTimings", () => {
  it("marca falhas e deixa tempos de espera/processamento indisponíveis", () => {
    const timings = eventsToTimings([
      { at: 10, event: "completed", jobId: "1" },
      { at: 20, event: "failed", jobId: "2", failedReason: "x" },
    ]);
    expect(timings[0]).toMatchObject({ finishedOn: 10, processedOn: null, failedReason: null });
    expect(timings[1]).toMatchObject({ finishedOn: 20, failedReason: "x" });
  });
});

describe("sampleEvenly", () => {
  it("devolve tudo quando há menos itens que a amostra", () => {
    expect(sampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it("espalha a amostra por toda a lista", () => {
    const sample = sampleEvenly(Array.from({ length: 100 }, (_, i) => i), 5);
    expect(sample).toEqual([0, 20, 40, 60, 80]);
  });
});

describe("retainsCompletedJobs", () => {
  it("retém quando (quase) toda a amostra existe", () => {
    expect(retainsCompletedJobs(30, 30)).toBe(true);
    expect(retainsCompletedJobs(27, 30)).toBe(true);
  });

  it("não retém quando os jobs foram removidos ou só os recentes sobraram", () => {
    expect(retainsCompletedJobs(0, 30)).toBe(false);
    expect(retainsCompletedJobs(10, 30)).toBe(false);
  });

  it("sem amostra, não conclui retenção", () => {
    expect(retainsCompletedJobs(0, 0)).toBe(false);
  });
});
