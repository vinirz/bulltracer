import { IncomingMessage, ServerResponse } from "node:http";
import type { Server } from "node:http";

import fastifyCors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
} from "fastify";
import type { Logger } from "pino";
import { WebSocket } from "ws";

import type { AppConfig } from "./config/env.js";
import type { AppDatabase } from "./db/client.js";
import { ApplicationError } from "./lib/errors.js";
import { AlertsService } from "./modules/alerts/application/alerts-service.js";
import {
  DrizzleAlertRuleRepository,
  DrizzleWebhookRepository,
} from "./modules/alerts/infrastructure/drizzle-alert-repository.js";
import { registerAlertsRoutes } from "./modules/alerts/infrastructure/alerts-routes.js";
import { WebhookDispatcher } from "./modules/alerts/infrastructure/webhook-dispatcher.js";
import { ConnectionService } from "./modules/connections/application/connection-service.js";
import { QueueInspectionService } from "./modules/connections/application/queue-inspection-service.js";
import { DrizzleConnectionRepository } from "./modules/connections/infrastructure/drizzle-connection-repository.js";
import { registerConnectionRoutes } from "./modules/connections/infrastructure/connection-routes.js";
import { registerInspectionRoutes } from "./modules/connections/infrastructure/inspection-routes.js";
import { RedisManager } from "./modules/connections/infrastructure/redis-manager.js";
import { InMemoryRuleEvaluator } from "./modules/monitor/application/in-memory-rule-evaluator.js";
import { Watcher } from "./modules/monitor/application/watcher.js";
import { WebSocketHub } from "./modules/monitor/infrastructure/websocket-hub.js";

/**
 * Contexto de dependências do servidor (DI manual — composition root).
 *
 * Cada módulo recebe apenas os contratos que consome (interfaces/interfaces
 * de portas), tornando unit tests triviais: basta trocar repositório real por
 * um fake. Este `BuildContext` é 100% testável em memória.
 */
export interface BuildContext {
  config: AppConfig;
  logger: Logger;
  db: AppDatabase;
}

export interface AppDependencies {
  connectionService: ConnectionService;
  queueInspection: QueueInspectionService;
  alertsService: AlertsService;
  watcher: Watcher;
  webSocketHub: WebSocketHub;
}

/** Composition root: constrói o grafo de dependências e o Fastify. */
export async function buildApp(ctx: BuildContext): Promise<{ app: FastifyInstance; deps: AppDependencies }> {
  const { config, logger, db } = ctx;

  /* ---------- Infrastructure ---------- */
  const redisManager = new RedisManager(logger);
  const connectionRepository = new DrizzleConnectionRepository(db);
  const webhookRepository = new DrizzleWebhookRepository(db);
  const alertRuleRepository = new DrizzleAlertRuleRepository(db);

  const webhookDispatcher = new WebhookDispatcher(
    {
      webhookTimeoutMs: config.WEBHOOK_TIMEOUT_MS,
      webhookRetryAttempts: config.WEBHOOK_RETRY_ATTEMPTS,
    },
    logger,
  );

  const webSocketHub = new WebSocketHub(logger);
  const ruleEvaluator = new InMemoryRuleEvaluator();

  /* ---------- Application (casos de uso) ---------- */
  const connectionService = new ConnectionService(connectionRepository, redisManager, logger);
  const queueInspection = new QueueInspectionService(connectionRepository, redisManager, logger);
  const alertsService = new AlertsService(alertRuleRepository, webhookRepository, connectionRepository, logger);
  const watcher = new Watcher(
    redisManager,
    alertsService,
    webhookDispatcher,
    ruleEvaluator,
    webSocketHub,
    logger,
  );

  const deps: AppDependencies = {
    connectionService,
    queueInspection,
    alertsService,
    watcher,
    webSocketHub,
  };

  /* ---------- Fastify ---------- */
  // `loggerInstance` espera um `FastifyBaseLogger`; o `Logger` do pino é
  // estruturalmente compatível em runtime, mas o TS exige o tipo da interface
  // Fastify — um cast pontual aqui é seguro (pino é o logger padrão do Fastify).
  const app = Fastify<Server, IncomingMessage, ServerResponse, FastifyBaseLogger>({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    bodyLimit: 1_048_576,
  });

  await app.register(fastifyWebsocket);
  await app.register(fastifyCors, {
    // Self-Hosted: por padrão aceita qualquer origem (o deploy real deve
    // restringir via CORS_ORIGIN — ex: "https://dashboard.empresa.com").
    origin: config.CORS_ORIGIN === "*" ? true : config.CORS_ORIGIN,
  });

  // Rotas REST por módulo.
  await app.register((instance, _opts, done) => {
    registerConnectionRoutes(instance, {
      connectionService,
      queueInspection,
      watcher,
    });
    registerInspectionRoutes(instance, {
      queueInspection,
    });
    registerAlertsRoutes(instance, {
      alertsService,
      connections: connectionRepository,
      watcher,
    });
    done();
  });

  // Streaming bidirecional via WebSocket.
  app.get("/ws", { websocket: true }, (socket: WebSocket) => {
    webSocketHub.add(socket);
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "bulltracer-server",
    timestamp: new Date().toISOString(),
  }));

  // Handler global de erro: `ApplicationError` vira status HTTP; o resto é erro 500.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApplicationError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    logger.error({ err: error }, "Erro interno não tratado");
    return reply.code(500).send({ error: "INTERNAL", message: "Erro interno do servidor" });
  });

  // Shutdown gracioso: fecha watcher, hub e pool de Redis.
  app.addHook("onClose", async () => {
    await watcher.close();
    webSocketHub.close();
    await redisManager.closeAll();
  });

  return { app, deps };
}
