import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildJobTimeline } from "@/lib/job-timeline";

import { JobTimeline } from "./JobTimeline";
import { StackTrace } from "./StackTrace";

const STACK = `Error: Falha simulada em emails (--fail-rate 30%)
    at Worker.Worker.connection.connection (/home/vinirz/tcc/bulltracer/bench/src/consumer.ts:54:15)
    at async /home/vinirz/tcc/node_modules/.pnpm/bullmq@6.3.16/node_modules/bullmq/dist/cjs/classes/worker.js:586:32`;

describe("StackTrace", () => {
  it("mostra erro, mensagem, frames e destaca a linha do código do usuário", () => {
    const html = renderToStaticMarkup(<StackTrace stacks={[STACK]} failedReason="Falha simulada em emails (--fail-rate 30%)" />);
    expect(html).toContain("Error: ");
    expect(html).toContain("Falha simulada em emails (--fail-rate 30%)");
    expect(html).toContain("consumer.ts");
    expect(html).toContain(":54:15");
    expect(html).toContain("text-zinc-600"); // frame de node_modules esmaecido
    expect(html).not.toContain("Tentativa"); // uma única tentativa: sem rótulo
  });

  it("numera as tentativas quando há mais de um stack", () => {
    const html = renderToStaticMarkup(<StackTrace stacks={[STACK, STACK]} />);
    expect(html).toContain("Tentativa 1");
    expect(html).toContain("Tentativa 2");
  });

  it("sem stacktrace, mantém a mensagem e avisa", () => {
    const html = renderToStaticMarkup(<StackTrace stacks={[]} failedReason="boom" />);
    expect(html).toContain("boom");
    expect(html).toContain("não registrou stack trace");
  });
});

describe("JobTimeline", () => {
  it("renderiza marcos e intervalos de um job concluído", () => {
    const T = new Date(2026, 9, 19, 17, 17, 42).getTime();
    const steps = buildJobTimeline({ status: "completed", timestamp: T, processedOn: T + 31_000, finishedOn: T + 31_022, now: T + 60_000 });
    const html = renderToStaticMarkup(<JobTimeline steps={steps} now={T + 60_000} />);
    expect(html).toContain("Adicionado em");
    expect(html).toContain("17:17:42");
    expect(html).toContain("Esperou");
    expect(html).toContain("31.0s");
    expect(html).toContain("Processo iniciado em");
    expect(html).toContain("17:18:13");
    expect(html).toContain("Executou por");
    expect(html).toContain("22ms");
    expect(html).toContain("Concluído em");
  });
});
