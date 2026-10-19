import { Queue } from "bullmq";

import {
  buildConnection,
  connectionFlags,
  connectionHelp,
  fail,
  parseFlags,
  parseNumber,
  resolveQueues,
  sleep,
} from "./common.js";

const values = parseFlags({
  ...connectionFlags,
  count: { type: "string", default: "1000" },
  rate: { type: "string", default: "0" },
  distribution: { type: "string", default: "even" },
  "remove-on-complete": { type: "boolean", default: false },
});

if (values.help) {
  console.log(`Uso: pnpm producer [opções]

Adiciona jobs a uma ou mais filas BullMQ.

Opções:
  --count <n>             Total de jobs, somando todas as filas (padrão: 1000)
  --rate <jobs/s>         Jobs por segundo no total; 0 = o mais rápido possível (padrão: 0)
  --distribution <modo>   Como repartir entre as filas: even (round-robin) ou random (padrão: even)
  --remove-on-complete    Jobs concluídos são removidos do Redis (removeOnComplete)
${connectionHelp}`);
  process.exit(0);
}

const count = parseNumber("--count", values.count, { min: 1, integer: true });
const rate = parseNumber("--rate", values.rate, { min: 0 });
const queueNames = resolveQueues(values);
const distribution = values.distribution;
if (distribution !== "even" && distribution !== "random") {
  fail(`valor inválido para --distribution: "${distribution}" (esperado even ou random)`);
}
const BATCH = 500;

const connection = buildConnection(values);
const queues = new Map(queueNames.map((name) => [name, new Queue(name, { connection })]));
const jobOptions = values["remove-on-complete"] ? { removeOnComplete: true } : {};

/** Fila de destino do job de número `seq` (0-based). */
function pickQueue(seq: number): string {
  return distribution === "even"
    ? (queueNames[seq % queueNames.length] as string)
    : (queueNames[Math.floor(Math.random() * queueNames.length)] as string);
}

async function main() {
  console.log(
    `[producer] filas=[${queueNames.join(", ")}] distribuição=${distribution} jobs=${count} taxa=${rate === 0 ? "máxima" : `${rate}/s`} removeOnComplete=${values["remove-on-complete"]}`,
  );
  const startedAt = Date.now();
  const perQueue = new Map(queueNames.map((name) => [name, 0]));
  let sent = 0;

  while (sent < count) {
    const size = rate === 0 ? Math.min(BATCH, count - sent) : 1;
    const batches = new Map<string, { name: string; data: object; opts: object }[]>();
    for (let i = 0; i < size; i++) {
      const seq = sent + i;
      const queueName = pickQueue(seq);
      const jobs = batches.get(queueName) ?? [];
      jobs.push({ name: "bench-job", data: { seq: seq + 1, queue: queueName, createdAt: Date.now() }, opts: jobOptions });
      batches.set(queueName, jobs);
    }
    await Promise.all(
      [...batches].map(async ([queueName, jobs]) => {
        await (queues.get(queueName) as Queue).addBulk(jobs);
        perQueue.set(queueName, (perQueue.get(queueName) ?? 0) + jobs.length);
      }),
    );
    sent += size;

    if (rate > 0) {
      // Mantém a cadência: o job N deve sair em N / rate segundos desde o início.
      const waitMs = startedAt + (sent / rate) * 1000 - Date.now();
      if (waitMs > 0) await sleep(waitMs);
    }
    if (sent % 1000 === 0 || sent === count) console.log(`[producer] ${sent}/${count} enviados`);
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(`[producer] concluído: ${sent} jobs em ${elapsed.toFixed(2)}s (${(sent / elapsed).toFixed(0)} jobs/s)`);
  if (queueNames.length > 1) {
    for (const [name, n] of perQueue) console.log(`[producer]   ${name}: ${n} jobs`);
  }
}

main()
  .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  .finally(() => void Promise.all([...queues.values()].map((q) => q.close())).then(() => process.exit(process.exitCode ?? 0)));
