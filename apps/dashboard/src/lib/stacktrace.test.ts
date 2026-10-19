import { describe, expect, it } from "vitest";

import { parseStackFrame, parseStackTrace } from "./stacktrace";

const SAMPLE = `Error: Falha simulada em emails (--fail-rate 30%)
    at Worker.Worker.connection.connection (/home/vinirz/tcc/bulltracer/bench/src/consumer.ts:54:15)
    at async /home/vinirz/tcc/node_modules/.pnpm/bullmq@6.3.16/node_modules/bullmq/dist/cjs/classes/worker.js:586:32`;

describe("parseStackTrace", () => {
  it("separa nome, mensagem e frames", () => {
    const parsed = parseStackTrace(SAMPLE);
    expect(parsed.name).toBe("Error");
    expect(parsed.message).toBe("Falha simulada em emails (--fail-rate 30%)");
    expect(parsed.frames).toHaveLength(2);
  });

  it("extrai função, arquivo, linha e coluna", () => {
    const [frame] = parseStackTrace(SAMPLE).frames;
    expect(frame).toMatchObject({
      fn: "Worker.Worker.connection.connection",
      file: "/home/vinirz/tcc/bulltracer/bench/src/consumer.ts",
      line: 54,
      column: 15,
      isAsync: false,
      isInternal: false,
    });
  });

  it("marca frames async sem função e dependências como internos", () => {
    const frame = parseStackTrace(SAMPLE).frames[1];
    expect(frame).toMatchObject({ isAsync: true, fn: undefined, line: 586, column: 32, isInternal: true });
  });

  it("mantém mensagens com várias linhas no cabeçalho", () => {
    const parsed = parseStackTrace("TypeError: campo inválido\nmais detalhes\n    at f (/a.js:1:2)");
    expect(parsed.name).toBe("TypeError");
    expect(parsed.message).toBe("campo inválido\nmais detalhes");
    expect(parsed.frames).toHaveLength(1);
  });

  it("aceita stack sem frames e cabeçalho fora do padrão", () => {
    expect(parseStackTrace("algo deu errado")).toEqual({ name: undefined, message: "algo deu errado", frames: [] });
    expect(parseStackTrace("Error: só a mensagem").frames).toEqual([]);
  });

  it("não quebra com texto vazio", () => {
    expect(parseStackTrace("")).toEqual({ name: undefined, message: "", frames: [] });
  });
});

describe("parseStackFrame", () => {
  it("trata frames do Node e locais sem posição", () => {
    expect(parseStackFrame("    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)")).toMatchObject({
      fn: "process.processTicksAndRejections",
      file: "node:internal/process/task_queues",
      line: 95,
      isInternal: true,
    });
    expect(parseStackFrame("    at <anonymous>")).toMatchObject({ file: "<anonymous>", line: undefined, isInternal: false });
  });

  it("trata construtores, caminhos do Windows e node_modules", () => {
    expect(parseStackFrame("    at new Foo (C:\\app\\src\\foo.js:10:3)")).toMatchObject({
      fn: "new Foo",
      file: "C:\\app\\src\\foo.js",
      line: 10,
      column: 3,
    });
    expect(parseStackFrame("    at x (C:\\app\\node_modules\\lib\\i.js:1:1)").isInternal).toBe(true);
  });

  it("devolve linhas que não são frames como texto cru", () => {
    const frame = parseStackFrame("    --- Async stack ---");
    expect(frame.raw).toBe("--- Async stack ---");
    expect(frame.fn).toBeUndefined();
    expect(frame.file).toBeUndefined();
  });
});
