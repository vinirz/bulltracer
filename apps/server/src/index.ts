import { loadConfig } from "./config/env.js";
import { openDatabase, runMigrations } from "./db/client.js";
import { createLogger } from "./lib/logger.js";
import { buildApp } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL, service: "bulltracer-server" });

  // SQLite local: única e exclusivamente configurações do dashboard.
  const db = openDatabase(config.DATABASE_PATH, "file");
  if (config.DATABASE_MIGRATE) {
    runMigrations(db);
  }

  const { app } = await buildApp({ config, logger, db });

  // Bind manual no http.Server cru: o `app.listen()` do Fastify loga uma linha
  // "Server listening" por interface de rede — com HOST=0.0.0.0 numa WSL2 isso
  // vira 7 linhas (NAT + bridges Docker). Aqui logamos exatamente uma.
  await app.ready();
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen({ host: config.HOST, port: config.PORT }, () => {
      app.server.off("error", reject);
      resolve();
    });
  });
  logger.info({ host: config.HOST, port: config.PORT }, "Server listening");

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Iniciando shutdown gracioso");
    // Watcher (QueueEvents) e Redis pool são fechados no hook onClose do Fastify.
    await app.close();
    db.$client.close();
    logger.info("Shutdown concluído");
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  // Logger ainda não disponível fora do escopo de main; pino falha com stack.
  console.error("[bulltracer-server] Falha fatal ao iniciar:", error);
  process.exit(1);
});
