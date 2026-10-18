import {
  aggregateErrors,
  aggregateHeatmap,
  aggregateMetrics,
  normalizeSignature,
  type JobTimings,
} from "../../src/modules/connections/application/metrics-aggregation.js";

const MIN = 60_000;

describe("aggregateMetrics", () => {
  it("agrupa jobs no bucket de 5 minutos correto e calcula espera/processamento", () => {
    const now = Date.UTC(2026, 9, 17, 12, 0, 0); // meio-dia UTC
    const jobs: JobTimings[] = [
      // terminou há 5min → bucket "-5min" (último com "agora" excluído)
      { id: "1", timestamp: now - 30 * MIN, processedOn: now - 29.9 * MIN, finishedOn: now - 6 * MIN },
      // terminou há 12min → bucket "-10min"
      { id: "2", timestamp: now - 25 * MIN, processedOn: now - 24.5 * MIN, finishedOn: now - 12 * MIN },
      // terminou há 2min → bucket "agora", com falha
      { id: "3", timestamp: now - 26 * MIN, processedOn: now - 25 * MIN, finishedOn: now - 2 * MIN, failedReason: "boom" },
    ];

    const points = aggregateMetrics(jobs, now, 3);
    expect(points).toHaveLength(3);
    const last = points[2]!; // "agora"
    expect(last.timeLabel).toBe("agora");
    expect(last.jobs).toBe(1);
    expect(last.failures).toBe(1);
    expect(last.failureRate).toBe(100);
    expect(last.waitTimeMs).toBe(1 * MIN);
    expect(last.processTimeMs).toBe(23 * MIN);

    const middle = points[1]!; // "-5min"
    expect(middle.timeLabel).toBe("-5min");
    expect(middle.jobs).toBe(1);
    expect(middle.failures).toBe(0);

    const first = points[0]!; // "-10min"
    expect(first.timeLabel).toBe("-10min");
    expect(first.jobs).toBe(1);
    expect(first.waitTimeMs).toBe(0.5 * MIN);
  });

  it("bucket mais recente soma throughput e conta falhas", () => {
    const now = Date.UTC(2026, 9, 17, 12, 0, 0);
    const jobs: JobTimings[] = [
      { id: "a", timestamp: now - 60_000, finishedOn: now - 30_000 },
      { id: "b", timestamp: now - 50_000, finishedOn: now - 20_000, failedReason: "x" },
    ];
    const points = aggregateMetrics(jobs, now, 1);
    expect(points).toHaveLength(1);
    const last = points[0]!;
    expect(last.jobs).toBe(2);
    expect(last.failures).toBe(1);
    expect(last.failureRate).toBe(50);
    // 2 jobs / 300s de janela (arredondado pelo toFixed(2) da função)
    expect(last.throughput).toBeCloseTo(2 / 300, 2);
    expect(last.waitTimeMs).toBeNull();
  });
});

describe("aggregateHeatmap", () => {
  it("conta volume e falha por dia-da-semana/hora e descarta jobs fora da janela", () => {
    const now = Date.UTC(2026, 9, 17, 12, 0, 0); // sábado
    // sábado 11h UTC (utcDay=6)
    const weekendMorning = Date.UTC(2026, 9, 17, 11, 30, 0);
    const weekendMorning2 = Date.UTC(2026, 9, 17, 11, 40, 0);
    // fora da janela de 14 dias
    const ancient = Date.UTC(2026, 8, 1, 11, 0, 0);
    const jobs: JobTimings[] = [
      { id: "1", timestamp: weekendMorning },
      { id: "2", timestamp: weekendMorning2, failedReason: "boom" },
      { id: "3", timestamp: ancient },
    ];
    const cells = aggregateHeatmap(jobs, now);
    expect(cells).toHaveLength(1);
    expect(cells[0]!).toMatchObject({ day: 6, hour: 11, volume: 2, failureRate: 50 });
  });
});

describe("aggregateErrors", () => {
  it("agrupa pela assinatura normalizada e ordena por frequência", () => {
    const jobs: JobTimings[] = [
      { id: "1", timestamp: 1, failedReason: 'Timeout ao acessar "pagamentos" 3 vezes' },
      { id: "2", timestamp: 2, failedReason: 'Timeout ao acessar "relatorios" 7 vezes' },
      { id: "3", timestamp: 3, failedReason: "Connection refused" },
    ];
    const groups = aggregateErrors(jobs);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.signature).toBe('Timeout ao acessar <valor> <n> vezes');
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.percentage).toBe(66.7);
    expect(groups[0]!.jobIds).toEqual(["1", "2"]);
    expect(groups[1]!.count).toBe(1);
  });

  it("ignora jobs sem failedReason", () => {
    const groups = aggregateErrors([{ id: "1", timestamp: 1 }]);
    expect(groups).toHaveLength(0);
  });
});

describe("normalizeSignature", () => {
  it("remove ids e números", () => {
    expect(normalizeSignature("ERRO [job-42]: 3 tentativas")).toBe("ERRO [job-<n>]: <n> tentativas");
  });
});
