import { Worker } from "bullmq";

import {
  buildConnection,
  connectionFlags,
  connectionHelp,
  parseFlags,
  parseNumber,
  parsePerQueue,
  resolveQueues,
  sleep,
} from "./common.js";

const values = parseFlags({
  ...connectionFlags,
  "fail-rate": { type: "string", default: "0" },
  "process-ms": { type: "string", default: "50" },
  concurrency: { type: "string", default: "1" },
});

if (values.help) {
  console.log(`Uso: pnpm consumer [opções]

Consome uma ou mais filas BullMQ, falhando uma porcentagem dos jobs de forma aleatória.
--fail-rate e --process-ms aceitam um valor único (todas as filas) ou pares fila=valor,
ex.: --queues orders,emails,reports --fail-rate orders=5,emails=30,reports=60

Opções:
  --fail-rate <0-100>     Porcentagem de jobs que devem falhar (padrão: 0)
  --process-ms <ms>       Tempo simulado de processamento por job (padrão: 50)
  --concurrency <n>       Jobs processados em paralelo, por fila (padrão: 1)
${connectionHelp}`);
  process.exit(0);
}

const queueNames = resolveQueues(values);
const failRates = parsePerQueue("--fail-rate", values["fail-rate"], queueNames, { min: 0, max: 100 }, 0);
const processTimes = parsePerQueue("--process-ms", values["process-ms"], queueNames, { min: 0 }, 50);
const concurrency = parseNumber("--concurrency", values.concurrency, { min: 1, integer: true });

const stats = new Map(queueNames.map((name) => [name, { completed: 0, failed: 0 }]));
const connection = buildConnection(values);

const workers = queueNames.map((queueName) => {
  const failRate = failRates.get(queueName) as number;
  const processMs = processTimes.get(queueName) as number;
  const counters = stats.get(queueName) as { completed: number; failed: number };

  const worker = new Worker(
    queueName,
    async (job) => {
      await sleep(processMs);
      if (Math.random() * 100 < failRate) {
        throw new Error(`Falha simulada em ${queueName} (--fail-rate ${failRate}%)`);
      }
      return { seq: job.data?.seq };
    },
    { connection, concurrency },
  );
  worker.on("completed", () => void counters.completed++);
  worker.on("failed", () => void counters.failed++);
  worker.on("error", (error) => console.error(`[consumer:${queueName}] erro: ${error.message}`));
  return worker;
});

console.log(`[consumer] concorrência=${concurrency} por fila (Ctrl+C para encerrar)`);
for (const name of queueNames) {
  console.log(`[consumer]   ${name}: falhas=${failRates.get(name)}% processamento=${processTimes.get(name)}ms`);
}

const totals = () => {
  let completed = 0;
  let failed = 0;
  for (const s of stats.values()) {
    completed += s.completed;
    failed += s.failed;
  }
  return { completed, failed, total: completed + failed };
};

function perQueueLine(): string {
  return queueNames
    .map((name) => {
      const s = stats.get(name) as { completed: number; failed: number };
      return `${name}=${s.completed + s.failed}${s.failed ? `(${s.failed} falhas)` : ""}`;
    })
    .join(" ");
}

let lastTotal = 0;
const reporter = setInterval(() => {
  const { completed, failed, total } = totals();
  if (total === lastTotal) return; // sem atividade: não polui o terminal
  console.log(
    `[consumer] processados=${total} ok=${completed} falhas=${failed} (${((failed / total) * 100).toFixed(1)}%) +${total - lastTotal}/s${queueNames.length > 1 ? ` | ${perQueueLine()}` : ""}`,
  );
  lastTotal = total;
}, 1000);

async function shutdown(signal: string) {
  clearInterval(reporter);
  console.log(`\n[consumer] ${signal}: encerrando...`);
  await Promise.all(workers.map((w) => w.close()));
  const { completed, failed, total } = totals();
  console.log(
    `[consumer] total=${total} ok=${completed} falhas=${failed}${total ? ` (${((failed / total) * 100).toFixed(1)}%)` : ""}`,
  );
  if (queueNames.length > 1) {
    for (const name of queueNames) {
      const s = stats.get(name) as { completed: number; failed: number };
      const n = s.completed + s.failed;
      console.log(`[consumer]   ${name}: ${n} jobs, ${s.failed} falhas${n ? ` (${((s.failed / n) * 100).toFixed(1)}%)` : ""}`);
    }
  }
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
