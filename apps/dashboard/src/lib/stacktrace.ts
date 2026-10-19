/**
 * Parser leve de stack traces do Node (`error.stack`) para exibição.
 * Sem I/O: recebe o texto e devolve nome, mensagem e frames estruturados.
 */

export interface StackFrame {
  /** Linha original, sem indentação. */
  raw: string;
  /** Função (`Worker.run`, `new Foo`, ...); ausente em frames anônimos. */
  fn?: string;
  file?: string;
  line?: number;
  column?: number;
  isAsync: boolean;
  /** Código do Node ou de dependências (`node:` / `node_modules`): exibido esmaecido. */
  isInternal: boolean;
}

export interface ParsedStack {
  /** Ex.: `Error`, `TypeError`; ausente se o cabeçalho não segue `Nome: mensagem`. */
  name?: string;
  message: string;
  frames: StackFrame[];
}

const FRAME_LINE = /^\s+at\s/;
const HEADER = /^([A-Za-z_$][\w$.]*):\s?([\s\S]*)$/;

export function parseStackFrame(line: string): StackFrame {
  const raw = line.trim();
  const plain: StackFrame = { raw, isAsync: false, isInternal: false };
  if (!raw.startsWith("at ")) return plain;

  let body = raw.slice(3);
  const isAsync = body.startsWith("async ");
  if (isAsync) body = body.slice(6);

  let fn: string | undefined;
  let location = body;
  const withFn = /^(.*?) \((.*)\)$/.exec(body);
  if (withFn) {
    fn = withFn[1];
    location = withFn[2] as string;
  }

  const position = /^(.*):(\d+):(\d+)$/.exec(location);
  const file = position ? (position[1] as string) : location;
  const isInternal =
    file.startsWith("node:") || file.includes("/node_modules/") || file.includes("\\node_modules\\");

  return {
    raw,
    fn,
    file,
    line: position ? Number(position[2]) : undefined,
    column: position ? Number(position[3]) : undefined,
    isAsync,
    isInternal,
  };
}

export function parseStackTrace(stack: string): ParsedStack {
  const lines = stack.split("\n");
  const firstFrame = lines.findIndex((l) => FRAME_LINE.test(l));
  const headerLines = firstFrame === -1 ? lines : lines.slice(0, firstFrame);
  const frameLines = firstFrame === -1 ? [] : lines.slice(firstFrame);

  const header = headerLines.join("\n").trim();
  const match = HEADER.exec(header);

  return {
    name: match?.[1],
    message: match ? (match[2] as string) : header,
    frames: frameLines.filter((l) => l.trim() !== "").map(parseStackFrame),
  };
}
