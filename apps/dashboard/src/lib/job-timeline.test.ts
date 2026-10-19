import { describe, expect, it } from "vitest";

import { buildJobTimeline } from "./job-timeline";

const T = 1_000_000;

describe("buildJobTimeline", () => {
  it("job concluído: adicionado → esperou → iniciado → executou → concluído", () => {
    const steps = buildJobTimeline({ status: "completed", timestamp: T, processedOn: T + 31_000, finishedOn: T + 31_022, now: T + 99_000 });
    expect(steps).toEqual([
      { kind: "event", label: "Adicionado em", at: T },
      { kind: "duration", label: "Esperou", ms: 31_000 },
      { kind: "event", label: "Processo iniciado em", at: T + 31_000 },
      { kind: "duration", label: "Executou por", ms: 22 },
      { kind: "event", label: "Concluído em", at: T + 31_022, tone: "success" },
    ]);
  });

  it("job falho termina em 'Falhou em'", () => {
    const steps = buildJobTimeline({ status: "failed", timestamp: T, processedOn: T + 10, finishedOn: T + 16, now: T + 500 });
    expect(steps.at(-1)).toEqual({ kind: "event", label: "Falhou em", at: T + 16, tone: "danger" });
  });

  it("aguardando: conta o tempo de espera até agora", () => {
    const steps = buildJobTimeline({ status: "waiting", timestamp: T, now: T + 5_000 });
    expect(steps).toEqual([
      { kind: "event", label: "Adicionado em", at: T },
      { kind: "duration", label: "Aguardando há", ms: 5_000 },
    ]);
  });

  it("ativo: mostra há quanto tempo está em execução", () => {
    const steps = buildJobTimeline({ status: "active", timestamp: T, processedOn: T + 100, now: T + 2_100 });
    expect(steps.at(-1)).toEqual({ kind: "duration", label: "Em execução há", ms: 2_000 });
  });

  it("atrasado: mostra o instante agendado (timestamp + delay)", () => {
    const steps = buildJobTimeline({ status: "delayed", timestamp: T, delayMs: 60_000, now: T + 1 });
    expect(steps).toEqual([
      { kind: "event", label: "Adicionado em", at: T },
      { kind: "event", label: "Agendado para", at: T + 60_000 },
    ]);
  });

  it("a espera desconta o delay agendado e nunca é negativa", () => {
    const delayed = buildJobTimeline({ status: "completed", timestamp: T, delayMs: 10_000, processedOn: T + 10_500, finishedOn: T + 10_600, now: T + 20_000 });
    expect(delayed[1]).toEqual({ kind: "duration", label: "Esperou", ms: 500 });
    const early = buildJobTimeline({ status: "completed", timestamp: T, delayMs: 10_000, processedOn: T + 9_000, finishedOn: T + 9_100, now: T + 20_000 });
    expect(early[1]).toEqual({ kind: "duration", label: "Esperou", ms: 0 });
  });

  it("sem processedOn (ex.: dados incompletos) cai para 'aguardando'", () => {
    const steps = buildJobTimeline({ status: "completed", timestamp: T, now: T + 3_000 });
    expect(steps[1]).toEqual({ kind: "duration", label: "Aguardando há", ms: 3_000 });
  });
});
