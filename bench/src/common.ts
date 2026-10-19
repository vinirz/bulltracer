import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

import type { RedisOptions } from "bullmq";

/** Opções de linha de comando compartilhadas pelo producer e pelo consumer. */
export const connectionFlags = {
  queue: { type: "string", default: "bench-queue" },
  queues: { type: "string" },
  host: { type: "string", default: process.env.REDIS_HOST ?? "localhost" },
  port: { type: "string", default: process.env.REDIS_PORT ?? "6377" },
  username: { type: "string", default: process.env.REDIS_USERNAME ?? 'default' },
  password: { type: "string", default: process.env.REDIS_PASSWORD ?? "passlocal" },
  help: { type: "boolean", short: "h", default: false },
} as const;

export const connectionHelp = `  --queue <nome>       Nome da fila (padrão: bench-queue)
  --queues <a,b,c>     Várias filas separadas por vírgula (substitui --queue)
  --host <host>        Host do Redis (padrão: localhost, ou REDIS_HOST)
  --port <porta>       Porta do Redis (padrão: 6390, ou REDIS_PORT)
  --username <user>    Usuário (ACL) do Redis (ou REDIS_USERNAME)
  --password <senha>   Senha do Redis (padrão: passlocal, ou REDIS_PASSWORD)
  -h, --help           Mostra esta ajuda`;

export function buildConnection(values: {
  host: string;
  port: string;
  username?: string;
  password?: string;
}): RedisOptions {
  return {
    host: values.host,
    port: parseNumber("--port", values.port, { min: 1, max: 65535, integer: true }),
    username: values.username,
    password: values.password,
    maxRetriesPerRequest: null,
  };
}

/** Converte e valida um valor numérico de flag; encerra com mensagem clara se inválido. */
export function parseNumber(
  flag: string,
  raw: string,
  { min, max, integer = false }: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const value = Number(raw);
  const invalid =
    raw.trim() === "" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    (min !== undefined && value < min) ||
    (max !== undefined && value > max);
  if (invalid) {
    const range = [min !== undefined ? `>= ${min}` : "", max !== undefined ? `<= ${max}` : ""]
      .filter(Boolean)
      .join(" e ");
    fail(`valor inválido para ${flag}: "${raw}"${range ? ` (esperado ${range})` : ""}`);
  }
  return value;
}

export function fail(message: string): never {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** parseArgs estrito, mas com erro legível (sem stack trace) para flags inválidas. */
export function parseFlags<const O extends ParseArgsOptionsConfig>(options: O) {
  try {
    return parseArgs({ options, strict: true }).values;
  } catch (error) {
    return fail(`${error instanceof Error ? error.message : String(error)} (use --help)`);
  }
}

/** Lista de filas alvo: `--queues a,b,c` ou, na ausência, `--queue`. Sem duplicatas. */
export function resolveQueues(values: { queue: string; queues?: string }): string[] {
  const names = [...new Set((values.queues ?? values.queue).split(",").map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) fail("nenhuma fila informada");
  for (const name of names) {
    if (name.includes(":")) fail(`nome de fila inválido: "${name}" (o BullMQ não aceita ":")`);
  }
  return names;
}

/**
 * Valor numérico por fila. Aceita um número único (vale para todas) ou pares
 * `fila=valor,fila=valor`; filas não citadas usam `fallback`.
 */
export function parsePerQueue(
  flag: string,
  raw: string,
  queues: string[],
  limits: { min?: number; max?: number; integer?: boolean },
  fallback: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!raw.includes("=")) {
    const value = parseNumber(flag, raw, limits);
    for (const queue of queues) result.set(queue, value);
    return result;
  }
  for (const queue of queues) result.set(queue, fallback);
  for (const pair of raw.split(",")) {
    const [name, value, ...rest] = pair.split("=").map((part) => part.trim());
    if (!name || value === undefined || rest.length > 0) fail(`${flag}: par inválido "${pair}" (use fila=valor)`);
    if (!queues.includes(name)) fail(`${flag}: a fila "${name}" não está em --queues (${queues.join(", ")})`);
    result.set(name, parseNumber(`${flag} (${name})`, value, limits));
  }
  return result;
}
