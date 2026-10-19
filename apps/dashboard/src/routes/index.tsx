import { createFileRoute } from "@tanstack/react-router";
import { Inbox, ServerOff } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueueCardSkeleton } from "@/components/ui/skeleton";
import { QueueCard } from "@/components/queues/QueueCard";
import { ThroughputChart } from "@/components/queues/ThroughputChart";
import { LatencyChart } from "@/components/queues/LatencyChart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { QueueMetricsResponse } from "@/lib/api/types";
import { queueColor } from "@/lib/queue-helpers";
import { useAppStore } from "@/store/useAppStore";
import type { SeriesPoint } from "@/types";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

function OverviewPage() {
  const isSwitchingConnection = useAppStore((s) => s.isSwitchingConnection);
  const apiStatus = useAppStore((s) => s.apiStatus);
  const queuesError = useAppStore((s) => s.queuesError);
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const queues = useAppStore(
    useShallow((s) => s.queues.filter((q) => q.connectionId === s.activeConnectionId)),
  );
  const [metricTab, setMetricTab] = useState("throughput");
  const [metricsByQueue, setMetricsByQueue] = useState<Record<string, QueueMetricsResponse | undefined>>(
    {},
  );

  const online = apiStatus === "online" && activeConnectionId !== null;

  // Busca as séries reais de cada fila no servidor (via Redis). Mantém o
  // formato esperado pelos gráficos: um ponto por bucket com o valor por fila.
  useEffect(() => {
    if (!online || !activeConnectionId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries: [string, QueueMetricsResponse | undefined][] = await Promise.all(
        queues.map(async (queue) => {
          try {
            return [queue.name, await api.getMetrics(activeConnectionId, queue.name, 60)] as const;
          } catch {
            return [queue.name, undefined] as const;
          }
        }),
      );
      if (!cancelled) setMetricsByQueue(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [online, activeConnectionId, queues]);

  // Um ponto por bucket de 5min, com o valor de cada fila (série vazia enquanto não há dados).
  const buildSeries = (valueOf: (p: QueueMetricsResponse["points"][number]) => number): SeriesPoint[] => {
    const first = metricsByQueue[queues[0]?.name ?? ""]?.points;
    if (!online || !first || first.length === 0) return [];
    return first.map((point, index) => {
      const row: SeriesPoint = { timeLabel: point.timeLabel };
      for (const queue of queues) {
        const p = metricsByQueue[queue.name]?.points[index];
        row[queue.name] = p ? valueOf(p) : 0;
      }
      return row;
    });
  };

  const throughputSeries = useMemo(
    () => buildSeries((p) => p.throughput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [online, metricsByQueue, queues],
  );
  const latencySeries = useMemo(
    () => buildSeries((p) => Math.round((p.waitTimeMs ?? 0) + (p.processTimeMs ?? 0))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [online, metricsByQueue, queues],
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Visão Geral</h1>
          <p className="text-sm text-zinc-500">
            Resumo de alto nível da instância Redis selecionada.
          </p>
        </div>
      </div>

      {!isSwitchingConnection && queues.length > 0 ? (
        <Card className="mb-6">
          <CardHeader className="flex-col items-start gap-3">
            <div className="flex w-full items-start justify-between gap-4">
              <div>
                <CardTitle className="font-sans text-base">
                  {metricTab === "throughput" ? "Throughput por Fila" : "Latência por Fila"}
                </CardTitle>
                <p className="text-xs text-zinc-500">
                  {metricTab === "throughput"
                    ? "Vazão (jobs/s) das últimas filas monitoradas, últimos ~60 minutos."
                    : "Tempo total (espera + processamento) por fila, últimos ~60 minutos."}
                </p>
              </div>
              <Tabs value={metricTab} onValueChange={setMetricTab}>
                <TabsList>
                  <TabsTrigger value="throughput">Throughput</TabsTrigger>
                  <TabsTrigger value="latency">Latência</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {metricTab === "throughput" ? (
              <ThroughputChart queues={queues} series={throughputSeries} />
            ) : (
              <LatencyChart queues={queues} series={latencySeries} />
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-zinc-800 pt-3">
              {queues.map((queue, index) => (
                <div key={queue.name} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: queueColor(index) }}
                  />
                  <span className="font-mono text-xs text-zinc-400">{queue.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isSwitchingConnection ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <QueueCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {queues.map((queue) => (
            <motion.div key={queue.name} variants={cardVariants}>
              <QueueCard queue={queue} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {!isSwitchingConnection && queues.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-center text-zinc-500">
          {apiStatus === "offline" ? (
            <>
              <ServerOff className="h-8 w-8 text-zinc-700" />
              <p className="text-sm">Servidor BullTracer não acessível.</p>
            </>
          ) : !activeConnectionId ? (
            <>
              <Inbox className="h-8 w-8 text-zinc-700" />
              <p className="text-sm">Cadastre uma conexão Redis em Conexões para começar.</p>
            </>
          ) : queuesError ? (
            <>
              <ServerOff className="h-8 w-8 text-zinc-700" />
              <p className="text-sm">Não foi possível ler as filas desta conexão.</p>
              <p className="max-w-md font-mono text-xs text-zinc-600">{queuesError}</p>
            </>
          ) : (
            <>
              <Inbox className="h-8 w-8 text-zinc-700" />
              <p className="text-sm">Nenhuma fila encontrada para esta conexão.</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
