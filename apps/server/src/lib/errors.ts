/**
 * Erros de domínio com mapeamento explícito para HTTP.
 *
 * `ApplicationError` é a base lançada pelas camadas de aplicação/domínio;
 * o handler global do Fastify traduz `statusCode` na resposta REST.
 */

export type ErrorCode =
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_ALREADY_EXISTS"
  | "WEBHOOK_NOT_FOUND"
  | "ALERT_RULE_NOT_FOUND"
  | "REDIS_UNREACHABLE"
  | "QUEUE_NOT_FOUND"
  | "JOB_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "INTERNAL";

export class ApplicationError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export function notFound(code: ErrorCode, message: string): ApplicationError {
  return new ApplicationError(404, code, message);
}

export function conflict(code: ErrorCode, message: string): ApplicationError {
  return new ApplicationError(409, code, message);
}

export function validationError(code: ErrorCode, message: string, details?: unknown): ApplicationError {
  return new ApplicationError(400, code, message, details);
}

export function redisUnreachable(message: string, cause?: unknown): ApplicationError {
  const error = new ApplicationError(502, "REDIS_UNREACHABLE", message);
  error.cause = cause;
  return error;
}

export function internalError(message: string, cause?: unknown): ApplicationError {
  const error = new ApplicationError(500, "INTERNAL", message);
  error.cause = cause;
  return error;
}
