import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { QueueInspectionService } from "../application/queue-inspection-service.js";

/**
 * Controller das rotas de inspeção profunda (séries, heatmap, erros e
 * detalhe de job) — leitura direta do Redis, sem persistir nada no SQLite
 * (Dupla Fonte de Verdade).
 */
export function registerInspectionRoutes(
  app: FastifyInstance,
  deps: { queueInspection: QueueInspectionService },
): void {
  /** Séries de 5 em 5 minutos de throughput, espera e processamento. */
  app.get("/api/connections/:id/queues/:name/metrics", async (request, reply) => {
    const { id, name } = request.params as { id: string; name: string };
    const query = z
      .object({ range: z.coerce.number().int().min(15).max(1440).default(60) })
      .parse(request.query as Record<string, string>);
    try {
      return await deps.queueInspection.getMetrics(id, name, query.range);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 502).send({ error: err.message });
    }
  });

  /** Distribuição volume/falha por (dia da semana, hora), últimos 14 dias. */
  app.get("/api/connections/:id/queues/:name/heatmap", async (request, reply) => {
    const { id, name } = request.params as { id: string; name: string };
    try {
      return await deps.queueInspection.getHeatmap(id, name);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 502).send({ error: err.message });
    }
  });

  /** Falhas agrupadas por assinatura da mensagem (mais frequentes primeiro). */
  app.get("/api/connections/:id/queues/:name/errors", async (request, reply) => {
    const { id, name } = request.params as { id: string; name: string };
    try {
      return await deps.queueInspection.getErrors(id, name);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 502).send({ error: err.message });
    }
  });

  /** Detalhe completo de um job específico. */
  app.get("/api/connections/:id/queues/:name/jobs/:jobId", async (request, reply) => {
    const { id, name, jobId } = request.params as { id: string; name: string; jobId: string };
    try {
      return await deps.queueInspection.getJob(id, name, jobId);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 502).send({ error: err.message });
    }
  });
}
