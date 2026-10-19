import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ConnectionRepository } from "../../connections/domain/ports.js";
import type { AlertsService } from "../application/alerts-service.js";
import type { Watcher } from "../../monitor/application/watcher.js";

const webhookSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
});

const alertRuleSchema = z.object({
  connectionId: z.string().min(1),
  queueName: z.string().min(1),
  metricType: z.enum(["failed_jobs", "wait_time_exceeded"]),
  threshold: z.number().finite().positive(),
  webhookId: z.string().min(1),
});

/**
 * Controller Fastify dos módulos Webhooks e Alertas.
 * Após criar/alterar regras, o watcher da fila afetada é re-sincronizado
 * (o stream QueueEvents não precisa reiniciar — ele já está escutando).
 */
export function registerAlertsRoutes(
  app: FastifyInstance,
  deps: {
    alertsService: AlertsService;
    connections: ConnectionRepository;
    watcher: Watcher;
  },
): void {
  /* ---------- Webhooks ---------- */

  app.get("/api/webhooks", async () => deps.alertsService.listWebhooks());

  app.get("/api/webhooks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await deps.alertsService.getWebhook(id);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  app.post("/api/webhooks", async (request, reply) => {
    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues });
    }
    try {
      return reply.code(201).send(await deps.alertsService.createWebhook(parsed.data));
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.put("/api/webhooks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = webhookSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues });
    }
    try {
      return await deps.alertsService.updateWebhook(id, parsed.data);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 404).send({ error: err.message });
    }
  });

  app.delete("/api/webhooks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deps.alertsService.removeWebhook(id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  /* ---------- Regras de alerta ---------- */

  app.get("/api/alerts", async () => deps.alertsService.listAlertRules());

  app.get("/api/alerts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await deps.alertsService.getAlertRule(id);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  app.post("/api/alerts", async (request, reply) => {
    const parsed = alertRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues });
    }
    try {
      const created = await deps.alertsService.createAlertRule(parsed.data);
      const connection = await deps.connections.findById(created.connectionId);
      if (connection) {
        await deps.watcher.watch(connection, created.queueName);
      }
      return reply.code(201).send(created);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
  });

  app.put("/api/alerts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = alertRuleSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues });
    }
    try {
      const updated = await deps.alertsService.updateAlertRule(id, parsed.data);
      deps.watcher.forgetRule(id); // regra alterada: recomeça como "normal"
      return updated;
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 404).send({ error: err.message });
    }
  });

  app.delete("/api/alerts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deps.alertsService.removeAlertRule(id);
      deps.watcher.forgetRule(id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });
}
