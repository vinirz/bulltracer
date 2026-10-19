import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { JobTimeline } from "@/components/jobs/JobTimeline";
import { StackTrace } from "@/components/jobs/StackTrace";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/ui/json-viewer";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { JobDetailDto } from "@/lib/api/types";
import { formatAge } from "@/lib/format";
import { buildJobTimeline } from "@/lib/job-timeline";
import { statusLabel, statusVariant } from "@/lib/queue-helpers";
import { useAppStore } from "@/store/useAppStore";
import { useToastStore } from "@/store/useToastStore";
import type { JobRecord, JobStatus } from "@/types";

export function JobInspector() {
  const { selectedJob, closeJobInspector } = useAppStore();

  return (
    <Sheet open={!!selectedJob} onOpenChange={(open) => !open && closeJobInspector()}>
      {selectedJob ? (
        <JobInspectorContent key={`${selectedJob.queueName}:${selectedJob.id}`} job={selectedJob} onClose={closeJobInspector} />
      ) : null}
    </Sheet>
  );
}

/** Estados do BullMQ que não existem na UI são tratados como o equivalente mais próximo. */
function toJobStatus(state: string | undefined, fallback: JobStatus): JobStatus {
  switch (state) {
    case "waiting":
    case "waiting-children":
    case "prioritized":
      return "waiting";
    case "active":
    case "completed":
    case "failed":
    case "delayed":
      return state;
    default:
      return fallback;
  }
}

function JobInspectorContent({ job, onClose }: { job: JobRecord; onClose: () => void }) {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  // A listagem não traz stacktrace nem tempos: o detalhe é buscado ao abrir.
  const [detail, setDetail] = useState<JobDetailDto | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now] = useState(() => Date.now()); // "agora" fixo enquanto o inspetor está aberto

  useEffect(() => {
    if (!activeConnectionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await api.getJob(activeConnectionId, job.queueName, job.id);
        if (!cancelled) setDetail(loaded);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeConnectionId, job.queueName, job.id]);

  const status = toJobStatus(detail?.state, job.status);
  const stacktrace = detail?.stacktrace ?? job.stacktrace ?? [];
  const failedReason = detail?.failedReason ?? job.failedReason;
  const attemptsMade = detail?.attemptsMade ?? job.attemptsMade;
  const isLoading = !detail && !loadFailed;

  const timeline = useMemo(() => {
    const opts = (detail?.opts ?? job.opts) as { delay?: number } | undefined;
    return buildJobTimeline({
      status,
      timestamp: detail?.timestamp ?? new Date(job.createdAt).getTime(),
      processedOn: detail?.processedOn,
      finishedOn: detail?.finishedOn,
      delayMs: opts?.delay,
      now,
    });
  }, [detail, job.opts, job.createdAt, status, now]);

  return (
    <>
      <SheetHeader
        title={`Job #${job.id}`}
        subtitle={`${job.queueName} · ${job.processName}`}
        onClose={onClose}
      />
      <SheetBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant[status]} pulse={status === "active"}>
            {statusLabel[status]}
          </Badge>
          <CopyIdButton id={job.id} />
          <span className="text-xs text-zinc-500">{formatAge(job.ageMs)}</span>
          <span className="text-xs text-zinc-500">
            · {attemptsMade}/{job.attemptsMax} tentativas
          </span>
        </div>

        <Tabs defaultValue="details" key={job.id}>
          <TabsList>
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="payload">Payload</TabsTrigger>
            <TabsTrigger
              value="logs"
              activeClassName={status === "failed" ? "!bg-red-500/20" : undefined}
              className={status === "failed" ? "text-red-400" : undefined}
            >
              Logs & Stacktrace
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <div className="mb-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Linha do tempo</p>
              {isLoading ? (
                <p className="text-sm text-zinc-500">Carregando detalhes…</p>
              ) : (
                <>
                  <JobTimeline steps={timeline} now={now} />
                  {attemptsMade > 1 ? (
                    <p className="mt-3 text-xs text-zinc-500">
                      Tempos da última tentativa; o job foi tentado {attemptsMade} vezes.
                    </p>
                  ) : null}
                  {loadFailed ? (
                    <p className="mt-3 text-xs text-amber-400">
                      Não foi possível carregar os tempos (o job pode ter sido removido).
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Opções</p>
            <JsonViewer value={job.opts} />
          </TabsContent>

          <TabsContent value="payload">
            <JsonViewer value={job.data} />
          </TabsContent>

          <TabsContent value="logs">
            {isLoading ? (
              <p className="text-sm text-zinc-500">Carregando detalhes…</p>
            ) : status === "failed" || stacktrace.length > 0 ? (
              <StackTrace stacks={stacktrace} failedReason={failedReason} />
            ) : (
              <p className="text-sm text-zinc-500">Nenhum erro registrado para este job.</p>
            )}
          </TabsContent>
        </Tabs>
      </SheetBody>
    </>
  );
}

function CopyIdButton({ id }: { id: string }) {
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
      onClick={() => {
        void navigator.clipboard.writeText(id);
        setCopied(true);
        push(`ID do job ${id} copiado para a área de transferência.`, "success");
      }}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      copiar ID
    </button>
  );
}

