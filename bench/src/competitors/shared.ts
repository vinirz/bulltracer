import { Redis } from "ioredis";

import { buildConnection, connectionFlags, connectionHelp, fail, parseFlags, parseNumber } from "../common.js";

/** Flags comuns aos concorrentes: as de conexão do bench + a porta onde a UI sobe. */
export function parseCompetitorFlags(defaultListenPort: number, toolName: string) {
  const values = parseFlags({
    ...connectionFlags,
    "listen-port": { type: "string", default: String(defaultListenPort) },
  });

  if (values.help) {
    console.log(`Uso: pnpm ${toolName} [opções]

Sobe o ${toolName} apontando para o mesmo Redis do bench, para comparar com o BullTracer.
As filas são descobertas no Redis (ou use --queues para fixar a lista).

Opções:
  --listen-port <porta>   Porta da UI (padrão: ${defaultListenPort})
${connectionHelp}`);
    process.exit(0);
  }

  return {
    values,
    listenPort: parseNumber("--listen-port", values["listen-port"], { min: 1, max: 65535, integer: true }),
    connection: buildConnection(values),
  };
}

/** Descobre as filas BullMQ do Redis (SCAN em `bull:<fila>:meta`) — como o BullTracer faz. */
export async function discoverQueues(
  connection: ReturnType<typeof buildConnection>,
  explicit?: string,
): Promise<string[]> {
  if (explicit) return explicit.split(",").map((n) => n.trim()).filter(Boolean);

  const redis = new Redis({
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: connection.password,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const names = new Set<string>();
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "bull:*:meta", "COUNT", 500);
      cursor = next;
      for (const key of keys) {
        const name = /^bull:([^:]+):meta$/.exec(key)?.[1];
        if (name) names.add(name);
      }
    } while (cursor !== "0");
    return [...names].sort();
  } catch (error) {
    return fail(`não foi possível ler o Redis (${connection.host}:${connection.port}): ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    redis.disconnect();
  }
}
