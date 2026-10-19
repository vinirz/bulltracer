import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import express from "express";

import { discoverQueues, parseCompetitorFlags } from "./shared.js";

const { values, listenPort, connection } = parseCompetitorFlags(3100, "bull-board");

const names = await discoverQueues(connection, values.queues);
if (names.length === 0) console.warn("[bull-board] nenhuma fila encontrada (rode o producer antes, ou use --queues).");

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/");
const queues = names.map((name) => new Queue(name, { connection }));
createBullBoard({ queues: queues.map((q) => new BullMQAdapter(q)), serverAdapter });

const app = express();
app.use("/", serverAdapter.getRouter());
const server = app.listen(listenPort, () => {
  console.log(`[bull-board] http://localhost:${listenPort}  filas=[${names.join(", ")}]  redis=${connection.host}:${connection.port}`);
});

async function shutdown() {
  server.close();
  await Promise.all(queues.map((q) => q.close()));
  process.exit(0);
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
