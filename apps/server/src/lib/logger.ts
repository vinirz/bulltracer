import pino, { type Logger } from "pino";

const DEFAULT_REDACT_PATHS = [
  // Senhas de conexão Redis jamais podem vazar em logs estruturados.
  "connections[*].password",
  "*.password",
  "password",
  "body.password",
];

/**
 * Logger centralizado (pino).
 *
 * Instanciado uma única vez na raiz da composição e injetado em todos os
 * módulos via construtor — nunca `import` direto, para que módulos sejam
 * testáveis com um logger "silencioso".
 */
export function createLogger(config: { level: string; service: string }): Logger {
  return pino({
    level: config.level,
    base: { service: config.service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: DEFAULT_REDACT_PATHS,
      censor: "[redacted]",
    },
  });
}
