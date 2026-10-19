import { computeWaitTimeMs } from "../../src/modules/monitor/application/wait-time.js";

describe("computeWaitTimeMs", () => {
  const now = 1_000_000;

  it("calcula processedOn - timestamp na primeira tentativa", () => {
    expect(computeWaitTimeMs({ timestamp: 990_000, processedOn: 995_000, attemptsMade: 0 }, now)).toBe(5_000);
  });

  it("usa 'now' quando processedOn ainda não foi gravado", () => {
    expect(computeWaitTimeMs({ timestamp: 990_000, attemptsMade: 0 }, now)).toBe(10_000);
  });

  it("não conta o delay agendado como espera", () => {
    const job = { timestamp: 900_000, processedOn: 1_000_500, attemptsMade: 0, opts: { delay: 100_000 } };
    expect(computeWaitTimeMs(job, now)).toBe(500);
  });

  it("nunca retorna negativo", () => {
    expect(computeWaitTimeMs({ timestamp: 1_000_100, processedOn: 1_000_000, attemptsMade: 0 }, now)).toBe(0);
  });

  it("ignora retentativas (espera não mensurável)", () => {
    expect(computeWaitTimeMs({ timestamp: 900_000, processedOn: 1_000_000, attemptsMade: 2 }, now)).toBeNull();
  });
});
