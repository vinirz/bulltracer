import { AlertTriangle, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/ui/json-viewer";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAge } from "@/lib/format";
import { statusLabel, statusVariant } from "@/lib/queue-helpers";
import { useAppStore } from "@/store/useAppStore";
import { useToastStore } from "@/store/useToastStore";
import type { JobRecord } from "@/types";

export function JobInspector() {
  const { selectedJob, closeJobInspector } = useAppStore();

  return (
    <Sheet open={!!selectedJob} onOpenChange={(open) => !open && closeJobInspector()}>
      {selectedJob ? <JobInspectorContent job={selectedJob} onClose={closeJobInspector} /> : null}
    </Sheet>
  );
}

function JobInspectorContent({ job, onClose }: { job: JobRecord; onClose: () => void }) {
  return (
    <>
      <SheetHeader
        title={`Job #${job.id}`}
        subtitle={`${job.queueName} · ${job.processName}`}
        onClose={onClose}
      />
      <SheetBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant[job.status]} pulse={job.status === "active"}>
            {statusLabel[job.status]}
          </Badge>
          <CopyIdButton id={job.id} />
          <span className="text-xs text-zinc-500">{formatAge(job.ageMs)}</span>
          <span className="text-xs text-zinc-500">
            · {job.attemptsMade}/{job.attemptsMax} tentativas
          </span>
        </div>

        <Tabs defaultValue="details" key={job.id}>
          <TabsList>
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="payload">Payload</TabsTrigger>
            <TabsTrigger
              value="logs"
              activeClassName={job.status === "failed" ? "!bg-red-500/20" : undefined}
              className={job.status === "failed" ? "text-red-400" : undefined}
            >
              Logs & Stacktrace
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <JsonViewer value={job.opts} />
          </TabsContent>

          <TabsContent value="payload">
            <JsonViewer value={job.data} />
          </TabsContent>

          <TabsContent value="logs">
            {job.status === "failed" ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  {job.failedReason}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-400">
                  {(job.stacktrace ?? []).join("\n")}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Nenhum erro registrado para este job.
              </p>
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

