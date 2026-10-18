import type { Logger } from "pino";

/**
 * Dispatcher de webhooks — dispara POSTs assíncronos SEM bloquear o Event Loop.
 *
 * O Watcher chama `dispatch()` sem aguardar (`void this.dispatcher.dispatch(...)`):
 * o body da requisição é serializado e o envio é delegado ao `fetch` nativo
 * (E/S não-bloqueante). Retry com backoff fixo + time limit.
 */
export interface WebhookDispatcherOptions {
  webhookTimeoutMs: number;
  webhookRetryAttempts: number;
}

export interface WebhookEventPayload {
  ruleId: string;
  queueName: string;
  metricType: string;
  value: number;
  threshold: number;
  occurredAt: string;
}

export class WebhookDispatcher {
  constructor(
    private readonly options: WebhookDispatcherOptions,
    private readonly logger: Logger,
  ) {}

  async dispatch(url: string, payload: WebhookEventPayload): Promise<void> {
    const attempts = this.options.webhookRetryAttempts + 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.options.webhookTimeoutMs);
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        this.logger.debug(
          { url, ruleId: payload.ruleId, statusCode: response.status },
          "Webhook disparado com sucesso",
        );
        return;
      } catch (error) {
        const last = attempt === attempts;
        this.logger.warn(
          {
            url,
            ruleId: payload.ruleId,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          },
          last ? "Webhook falhou após todas as tentativas" : "Tentativa de webhook falhou",
        );
        if (last) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
}
