import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Copy,
  Gauge,
  Inbox,
  Info,
  Search,
  SquareArrowOutUpRight,
  Timer,
  TimerReset,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { QueueHeatmap } from "@/components/queues/QueueHeatmap";
import { ErrorGroupList } from "@/components/queues/ErrorGroupList";
import { MetricCard } from "@/components/queues/MetricCard";
import { api } from "@/lib/api";
import type {
  ErrorGroupDto,
  HeatmapCellDto,
  JobListItem,
  JobStatusParam,
  QueueMetricsResponse,
} from "@/lib/api/types";
import { groupJobErrors } from "@/lib/error-grouping";
import { formatAge, formatMs, formatThroughput } from "@/lib/format";
import {
  queuePressureColor,
  queuePressureLabel,
  statusLabel,
  statusVariant,
} from "@/lib/queue-helpers";
import { cn } from "@/lib/utils";
import { buildHeatmapData, mockJobs, mockQueues } from "@/mocks";
import { useAppStore } from "@/store/useAppStore";
import { useToastStore } from "@/store/useToastStore";
import type { JobRecord, JobStatus } from "@/types";

export const Route = createFileRoute("/queues/$queueName")({
  component: QueueDetailPage,
});

const statusFilters: Array<{ value: JobStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "waiting", label: "Aguardando" },
  { value: "active", label: "Ativo" },
  { value: "completed", label: "Concluído" },
  { value: "failed", label: "Falhou" },
  { value: "delayed", label: "Atrasado" },
];

function QueueDetailPage() {
  const { queueName } = Route.useParams();
  const openJobInspector = useAppStore((s) => s.openJobInspector);
  const apiStatus = useAppStore((s) => s.apiStatus);
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const activeQueues = useAppStore(
    useShallow((s) => s.queues.filter((q) => q.connectionId === s.activeConnectionId)),
  );
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [search, setSearch] = useState("");

  const queue =
    activeQueues.find((q) => q.name === queueName) ??
    mockQueues.find((q) => q.name === queueName);
  const online = apiStatus === "online" && activeConnectionId !== null;

  // Dados reais do servidor (leitura direta do Redis), com fallback para os
  // mocks de demonstração quando a API está offline.
  const [remoteJobs, setRemoteJobs] = useState<JobRecord[]>([]);
  const [remoteHeatmap, setRemoteHeatmap] = useState<HeatmapCellDto[] | null>(null);
  const [remoteErrors, setRemoteErrors] = useState<ErrorGroupDto[] | null>(null);
  const [queueMetrics, setQueueMetrics] = useState<QueueMetricsResponse | null>(null);

  useEffect(() => {
    if (!online || !activeConnectionId) return; // estado limpo fora do effect (fallback mock)
    let cancelled = false;
    const statuses: JobStatusParam[] = ["waiting", "active", "completed", "failed", "delayed"];
    void (async () => {
      try {
        const pages = await Promise.all(
          statuses.map((status) => api.listJobs(activeConnectionId, queueName, { status, limit: 50 })),
        );
        if (cancelled) return;
        setRemoteJobs(
          pages.flatMap((page) => page.items.map((item) => toJobRecord(item, queueName, page.status))),
        );
      } catch {
        if (!cancelled) setRemoteJobs([]);
      }
    })();
    void (async () => {
      try {
        const [cells, groups, metrics] = await Promise.all([
          api.getHeatmap(activeConnectionId, queueName),
          api.getErrors(activeConnectionId, queueName),
          api.getMetrics(activeConnectionId, queueName, 60),
        ]);
        if (cancelled) return;
        setRemoteHeatmap(cells);
        setRemoteErrors(groups);
        setQueueMetrics(metrics);
      } catch {
        if (!cancelled) {
          setRemoteHeatmap(null);
          setRemoteErrors(null);
          setQueueMetrics(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, activeConnectionId, queueName]);

  const mockJobsForQueue = useMemo(
    () => mockJobs.filter((job) => job.queueName === queueName),
    [queueName],
  );
  const allJobs = online ? remoteJobs : mockJobsForQueue;

  const jobs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return allJobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;

      if (query) {
        const haystack = `${job.id} ${job.processName} ${JSON.stringify(job.data)}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [allJobs, statusFilter, search]);

  const errorGroups = useMemo(() => {
    if (online && remoteErrors) return remoteErrors;
    return groupJobErrors(allJobs);
  }, [online, remoteErrors, allJobs]);

  const heatmapCells = useMemo(() => {
    if (online && remoteHeatmap) return remoteHeatmap;
    return buildHeatmapData(queueName, queue?.health ?? "healthy");
  }, [online, remoteHeatmap, queueName, queue?.health]);

  const metrics = queueMetrics?.summary ?? queue?.metrics;

  const handleOpenJob = (jobId: string) => {
    const known = allJobs.find((job) => job.id === jobId);
    if (known) {
      openJobInspector(known);
      return;
    }
    if (online && activeConnectionId) {
      void (async () => {
        try {
          const detail = await api.getJob(activeConnectionId, queueName, jobId);
          openJobInspector(
            toJobRecord(
              {
                id: detail.id,
                name: detail.name,
                data: detail.data,
                opts: detail.opts,
                failedReason: detail.failedReason,
                timestamp: detail.timestamp,
                attemptsMade: detail.attemptsMade,
                stacktrace: detail.stacktrace,
              },
              queueName,
              detail.failedReason ? "failed" : "completed",
            ),
          );
        } catch {
          // job pode ter sido removido do Redis; inspector permanece fechado
        }
      })();
    }
  };

  return (
    <div className="p-6">
      <div className="mb-1 text-xs text-zinc-500">
        <Link to="/" className="transition-colors hover:text-zinc-300">
          Visão Geral
        </Link>{" "}
        / {queueName}
      </div>
      <h1 className="mb-1 font-mono text-xl font-semibold text-zinc-100">{queueName}</h1>
      {queue ? (
        <p className="mb-6 text-sm text-zinc-500">
          {queue.counts.waiting} aguardando · {queue.counts.active} ativos ·{" "}
          {queue.counts.failed} falhas
        </p>
      ) : null}

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="details">Detalhes</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
              {statusFilters.map((filter) => {
                const isActive = statusFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      "relative rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-200",
                      isActive && "text-zinc-100",
                    )}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="status-filter-indicator"
                        transition={{ type: "spring", stiffness: 500, damping: 36 }}
                        className="absolute inset-0 rounded-md bg-zinc-800"
                      />
                    ) : null}
                    <span className="relative">{filter.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por ID, processo ou dados..."
                  className="w-56 rounded-md border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">ID</th>
                  <th className="px-4 py-2.5 font-medium">Nome do Processo</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Idade</th>
                  <th className="px-4 py-2.5 font-medium">Tentativas</th>
                  <th className="px-4 py-2.5 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                <AnimatePresence initial={false}>
                  {jobs.map((job, index) => (
                    <motion.tr
                      key={job.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { delay: index * 0.02 } }}
                      exit={{ opacity: 0 }}
                      onClick={() => openJobInspector(job)}
                      className="group cursor-pointer transition-colors duration-150 hover:bg-zinc-900/60"
                    >
                      <td className="px-4 py-2.5">
                        <CopyIdCell id={job.id} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">
                        {job.processName}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={statusVariant[job.status]}
                          pulse={job.status === "active"}
                        >
                          {statusLabel[job.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500">
                        {formatAge(job.ageMs)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500">
                        {job.attemptsMade}/{job.attemptsMax}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors group-hover:text-zinc-200"
                          title="Ver detalhes do job"
                        >
                          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                          Inspecionar
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>

            {jobs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-zinc-500">
                <Inbox className="h-6 w-6 text-zinc-700" />
                <p className="text-sm">Nenhum job encontrado com este filtro.</p>
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="details">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader className="flex-col items-start gap-1">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="font-sans text-base">Heatmap de Picos</CardTitle>
                  <Tooltip content="Cada célula representa uma combinação de dia da semana e horário. Quanto mais escura/intensa a cor, maior o valor da métrica selecionada naquele intervalo.">
                    <Info className="h-3.5 w-3.5 cursor-help text-zinc-600 hover:text-zinc-400" />
                  </Tooltip>
                </div>
                <p className="text-xs text-zinc-500">
                  Volume de jobs e taxa de falha por dia da semana e horário.
                </p>
              </CardHeader>
              <CardContent>
                <QueueHeatmap cells={heatmapCells} />
              </CardContent>
            </Card>

            {queue ? (
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center sm:grid-cols-5">
                <CountStat label="Aguardando" value={queue.counts.waiting} className="text-amber-400" />
                <CountStat label="Ativos" value={queue.counts.active} className="text-blue-400" />
                <CountStat label="Concluídos" value={queue.counts.completed} className="text-emerald-400" />
                <CountStat label="Falhas" value={queue.counts.failed} className="text-red-400" />
                <CountStat label="Atrasados" value={queue.counts.delayed} className="text-zinc-300" />
              </div>
            ) : null}

            {metrics ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  icon={Gauge}
                  label="Vazão"
                  value={formatThroughput(metrics.throughput)}
                  description="Quantidade de jobs que esta fila consegue processar por segundo."
                  formula="Vazão = Jobs concluídos ÷ Tempo decorrido (s)"
                />
                <MetricCard
                  icon={TimerReset}
                  label="Tempo de espera"
                  value={formatMs(metrics.waitTimeMs)}
                  tone={metrics.waitTimeMs > 3000 ? "warning" : "default"}
                  description="Tempo médio que um job fica aguardando na fila antes de começar a ser processado."
                  formula="Espera média = média(Início do processamento − Criação do job)"
                />
                <MetricCard
                  icon={Timer}
                  label="Processamento"
                  value={formatMs(metrics.processTimeMs)}
                  description="Tempo médio que o worker leva para executar um job do início ao fim."
                  formula="Processamento médio = média(Fim da execução − Início da execução)"
                />
                <MetricCard
                  icon={Gauge}
                  label="Pressão da fila"
                  value={queuePressureLabel(metrics.queuePressure)}
                  tone={
                    metrics.queuePressure >= 80
                      ? "danger"
                      : metrics.queuePressure >= 50
                        ? "warning"
                        : "default"
                  }
                  description="Indica o risco de a fila acumular jobs mais rápido do que consegue processar. Acima de 80% sinaliza risco de gargalo."
                  formula="Pressão = (Jobs em espera ÷ Vazão atual) × 100%"
                  footer={
                    <Progress
                      value={metrics.queuePressure}
                      indicatorClassName={queuePressureColor(metrics.queuePressure)}
                    />
                  }
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Fila não encontrada.</p>
            )}

            <Card>
              <CardHeader className="flex-col items-start gap-1">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="font-sans text-base">Agrupamento de Erros</CardTitle>
                  <Tooltip content="Falhas com mensagens semelhantes são agrupadas pela mesma assinatura de erro, para facilitar encontrar a causa mais frequente.">
                    <Info className="h-3.5 w-3.5 cursor-help text-zinc-600 hover:text-zinc-400" />
                  </Tooltip>
                </div>
                <p className="text-xs text-zinc-500">
                  Falhas agrupadas por assinatura do erro, das mais para as menos frequentes.
                </p>
              </CardHeader>
              <CardContent>
                <ErrorGroupList groups={errorGroups} onOpenJob={handleOpenJob} />
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-zinc-500">
                Em breve: alertas específicos desta fila e demais gráficos de monitoramento
                aparecerão aqui.
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Converte um item da listagem (ou do detalhe) de jobs da API no modelo de
 * UI `JobRecord` usado pela tabela e pelo Job Inspector.
 */
function toJobRecord(
  item: Pick<JobListItem, "id" | "name" | "data" | "opts" | "failedReason" | "timestamp" | "attemptsMade"> & {
    stacktrace?: string[];
  },
  queueName: string,
  status: JobStatus,
): JobRecord {
  const opts = (item.opts ?? {}) as JobRecord["opts"];
  return {
    id: item.id,
    queueName,
    processName: item.name || "JOB",
    status,
    attemptsMade: item.attemptsMade,
    attemptsMax: opts.attempts ?? 1,
    ageMs: Math.max(0, Date.now() - item.timestamp),
    createdAt: new Date(item.timestamp).toISOString(),
    opts,
    data: item.data,
    failedReason: item.failedReason ?? undefined,
    stacktrace: item.stacktrace,
  };
}

function CountStat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <p className={cn("font-mono text-sm font-semibold", className)}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
    </div>
  );
}

function CopyIdCell({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(id);
        setCopied(true);
        push(`ID ${id} copiado.`, "success");
      }}
      className="flex items-center gap-1.5 font-mono text-xs text-zinc-300 transition-colors hover:text-zinc-100"
    >
      {id}
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 text-zinc-600" />
      )}
    </button>
  );
}
