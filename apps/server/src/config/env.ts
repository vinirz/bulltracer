import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default("./data/dashboard.db"),
  DATABASE_MIGRATE: z.coerce.boolean().default(true),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().default("*"),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  WEBHOOK_RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(3),
  /** Intervalo entre lembretes de um alerta ainda ativo (ms); 0 desliga. */
  ALERT_REMINDER_MS: z.coerce.number().int().min(0).default(900_000),
  /** Tempo sem violação para declarar o alerta recuperado (ms). */
  ALERT_RECOVERY_MS: z.coerce.number().int().positive().default(60_000),
  /** Frequência da checagem de recuperação/lembretes (ms). */
  ALERT_TICK_MS: z.coerce.number().int().positive().default(5000),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${details}`);
  }
  return parsed.data;
}
