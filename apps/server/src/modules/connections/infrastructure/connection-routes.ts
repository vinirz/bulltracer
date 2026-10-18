import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { Watcher } from "../../monitor/application/watcher.js";
import type { ConnectionService } from "../application/connection-service.js";
import { toConnectionView } from "../domain/entities.js";
import type { QueueInspectionService } from "../application/queue-inspection-service.js";

const connectionSchema = z.object({
  name: z.string().min(1).max(120),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(6379),
  password: z.string().optional(),
  db: z.number().int().min(0).default(0),
});

const connectionTestSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(6379),
  password: z.string().optional(),
  db: z.number().int().min(0).default(0),
});

/**
 * Controller Fastify do módulo Connections.
 * Recebe os casos de uso por injeção — nada de `import` de infraestrutura aqui.
 */
export function registerConnectionRoutes(
  app: FastifyInstance,
  deps: {
    connectionService: ConnectionService;
    queueInspection: QueueInspectionService;
    watcher: Watcher;
  },
): void {
  app.get("/api/connections", async () => {
    const all = await deps.connectionService.list();
    return all.map(toConnectionView);
  });

  app.get("/api/connections/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const connection = await deps.connectionService.get(id);
      return toConnectionView(connection);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  app.post("/api/connections", async (request, reply) => {
    const parsed = connectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues });
    }
    try {
      const created = await deps.connectionService.create(parsed.data);
      return reply.code(201).send(toConnectionView(created));
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  app.post("/api/connections/test", async (request, reply) => {
    const parsed = connectionTestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues });
    }
    return deps.connectionService.test(parsed.data);
  });

  app.put("/api/connections/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = connectionSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues });
    }
    try {
      const updated = await deps.connectionService.update(id, parsed.data);
      return toConnectionView(updated);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  app.delete("/api/connections/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deps.connectionService.remove(id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  /** Descobre as filas do Redis alvo (snapshot de nomes). */
  app.get("/api/connections/:id/queues", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const queues = await deps.queueInspection.discoverQueues(id);
      const snapshots = [];
      for (const queueName of queues) {
        snapshots.push(await deps.queueInspection.getQueueSnapshot(id, queueName));
        // Dispara o monitoramento reativo da fila descoberta.
        const connection = await deps.connectionService.get(id);
        await deps.watcher.watch(connection, queueName);
      }
      return snapshots;
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 502).send({ error: err.message });
    }
  });

  app.get("/api/connections/:id/queues/:name/jobs", async (request, reply) => {
    const { id, name } = request.params as { id: string; name: string };
    const query = z
      .object({
        status: z.enum(["waiting", "active", "completed", "failed", "delayed"]).default("failed"),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query as Record<string, string>);
    try {
      return await deps.queueInspection.getJobs(id, name, query);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 502).send({ error: err.message });
    }
  });
}
