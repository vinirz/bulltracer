import { api, ApiError } from "@/lib/api";

export interface ParsedConnectionUrl {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/** Faz o parse de uma connection string no formato redis[s]://[user:pass@]host:port. */
export function parseRedisUrl(url: string): ParsedConnectionUrl | null {
  try {
    const parsed = new URL(url);
    if (!/^rediss?:$/.test(parsed.protocol)) return null;
    if (!parsed.hostname) return null;
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
    };
  } catch {
    return null;
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

/**
 * Teste de conexão REAL: quem toca o Redis é o servidor BullTracer (POST
 * /api/connections/test) — é ele quem precisará alcançar o target, e ele
 * valida autenticação, rede e timeout com mensagens legíveis.
 */
export async function testRedisConnection(
  params: ParsedConnectionUrl,
): Promise<ConnectionTestResult> {
  try {
    return await api.testConnection({
      host: params.host,
      port: params.port,
      password: params.password,
      db: undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, latencyMs: 0, message: error.message };
    }
    return {
      ok: false,
      latencyMs: 0,
      message: "Servidor BullTracer indisponível — não foi possível testar a conexão.",
    };
  }
}
