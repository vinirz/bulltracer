import type { FastifyInstance } from "fastify";
import request from "supertest";

import { loadConfig } from "../../src/config/env.js";
import type { AppDatabase } from "../../src/db/client.js";
import { openDatabase, runMigrations } from "../../src/db/client.js";
import { createLogger } from "../../src/lib/logger.js";
import { buildApp } from "../../src/server.js";

/**
 * Testes de integração REST (supertest contra o Fastify real).
 *
 * O SQLite roda em memória; o acesso ao Redis é desacoplado via injeção —
 * conexões com host fictício nunca são contatadas nas rotas CRUD. As rotas
 * de inspeção de filas exigem Redis real e são cobertas por testes de
 * integração com Redis (CI opcional / ambiente de desenvolvimento local).
 */

describe("REST API (@bulltracer/server)", () => {
  let app: FastifyInstance;
  let db: AppDatabase;

  beforeAll(async () => {
    db = openDatabase(":memory:", "memory");
    runMigrations(db);
    const config = loadConfig({ LOG_LEVEL: "silent" });
    const logger = createLogger({ level: config.LOG_LEVEL, service: "test" });
    app = (await buildApp({ config, logger, db })).app;
    await app.ready();
  });

  afterAll(async () => {
    // Encerra sockets keep-alive do supertest que impediriam o server.close.
    app.server.closeAllConnections?.();
    await app.close();
    // Fecha o SQLite em memória para o Jest detectar zero handles abertos.
    db.$client.close();
  });

  it("GET /api/health responde ok", async () => {
    const response = await request(app.server).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("CRUD completo de conexões", async () => {
    const created = await request(app.server)
      .post("/api/connections")
      .send({ name: "Produção", host: "localhost", port: 6379 });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();
    const id: string = created.body.id;

    const list = await request(app.server).get("/api/connections");
    expect(list.status).toBe(200);
    expect(list.body.find((c: { id: string }) => c.id === id)).toBeDefined();

    const updated = await request(app.server)
      .put(`/api/connections/${id}`)
      .send({ name: "Produção Renomeada" });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Produção Renomeada");

    const removed = await request(app.server).delete(`/api/connections/${id}`);
    expect(removed.status).toBe(204);
  });

  it("rejeita criação de conexão duplicada", async () => {
    await request(app.server)
      .post("/api/connections")
      .send({ name: "Única", host: "redis.example.com", port: 6379 });
    const dup = await request(app.server)
      .post("/api/connections")
      .send({ name: "Única", host: "redis.example.com", port: 6379 });
    expect(dup.status).toBe(409);
  });

  it("CRUD completo de webhooks", async () => {
    const created = await request(app.server)
      .post("/api/webhooks")
      .send({ name: "Slack", url: "https://hooks.slack.com/services/x" });
    expect(created.status).toBe(201);
    const id: string = created.body.id;

    const list = await request(app.server).get("/api/webhooks");
    expect(list.body.find((w: { id: string }) => w.id === id)).toBeDefined();

    const updated = await request(app.server)
      .put(`/api/webhooks/${id}`)
      .send({ name: "Slack #alerts" });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Slack #alerts");

    await request(app.server).delete(`/api/webhooks/${id}`).expect(204);
  });

  it("rejeita webhook com URL inválida", async () => {
    const bad = await request(app.server)
      .post("/api/webhooks")
      .send({ name: "X", url: "not-a-url" });
    expect(bad.status).toBe(400);
  });

  it("cria regra válida; rejeita regra com FK inexistente e metricType inválido", async () => {
    const conn = await request(app.server)
      .post("/api/connections")
      .send({ name: "Prod", host: "r1", port: 6379 });
    const webhook = await request(app.server)
      .post("/api/webhooks")
      .send({ name: "Hook", url: "https://example.com/h" });

    const rule = await request(app.server)
      .post("/api/alerts")
      .send({
        connectionId: conn.body.id,
        queueName: "video",
        metricType: "failed_jobs",
        threshold: 5,
        webhookId: webhook.body.id,
      });
    expect(rule.status).toBe(201);
    expect(rule.body.queueName).toBe("video");

    const orphan = await request(app.server)
      .post("/api/alerts")
      .send({
        connectionId: "inexistente",
        queueName: "email",
        metricType: "failed_jobs",
        threshold: 1,
        webhookId: webhook.body.id,
      });
    expect(orphan.status).toBe(404);

    const badMetric = await request(app.server)
      .post("/api/alerts")
      .send({
        connectionId: conn.body.id,
        queueName: "email",
        metricType: "bogus",
        threshold: 1,
        webhookId: webhook.body.id,
      });
    expect(badMetric.status).toBe(400);
  });

  it("GET /api/connections/:id/queues retorna 404 para conexão inexistente", async () => {
    const result = await request(app.server).get("/api/connections/xxx/queues");
    expect(result.status).toBe(404);
  });

  it("rotas de inspeção (metrics/heatmap/errors/jobs) retornam 404 para conexão inexistente", async () => {
    const base = "/api/connections/xxx/queues/fila";
    const metrics = await request(app.server).get(`${base}/metrics?range=60`);
    expect(metrics.status).toBe(404);
    const heatmap = await request(app.server).get(`${base}/heatmap`);
    expect(heatmap.status).toBe(404);
    const errors = await request(app.server).get(`${base}/errors`);
    expect(errors.status).toBe(404);
    const job = await request(app.server).get(`${base}/jobs/123`);
    expect(job.status).toBe(404);
  });

  it("DELETE com Content-Type JSON e corpo vazio funciona (webhook, regra e conexão)", async () => {
    const asJson = (req: request.Test) => req.set("Content-Type", "application/json");

    const conn = await request(app.server)
      .post("/api/connections")
      .send({ name: "del-conn", host: "redis.invalid", port: 6379 })
      .expect(201);
    const webhook = await request(app.server)
      .post("/api/webhooks")
      .send({ name: "del-hook", url: "https://example.com/hook" })
      .expect(201);
    const rule = await request(app.server)
      .post("/api/alerts")
      .send({
        connectionId: conn.body.id,
        queueName: "q",
        metricType: "failed_jobs",
        threshold: 3,
        webhookId: webhook.body.id,
      })
      .expect(201);

    await asJson(request(app.server).delete(`/api/alerts/${rule.body.id}`)).expect(204);
    await asJson(request(app.server).delete(`/api/webhooks/${webhook.body.id}`)).expect(204);
    await asJson(request(app.server).delete(`/api/connections/${conn.body.id}`)).expect(204);
  });

  it("JSON malformado continua respondendo 400", async () => {
    await request(app.server)
      .post("/api/webhooks")
      .set("Content-Type", "application/json")
      .send("{nao-e-json")
      .expect(400);
  });
});
