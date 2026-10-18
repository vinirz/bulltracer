import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ErrorGroup } from "@/lib/error-grouping";

export function ErrorGroupList({
  groups,
  onOpenJob,
}: {
  groups: ErrorGroup[];
  onOpenJob: (jobId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">
        Nenhum erro registrado nesta fila.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const isExpanded = expanded === group.signature;
        return (
          <div key={group.signature} className="rounded-lg border border-zinc-800 p-3">
            <button
              type="button"
              onClick={() => setExpanded(isExpanded ? null : group.signature)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-zinc-200">{group.signature}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={group.percentage} className="max-w-48" indicatorClassName="bg-red-500" />
                  <span className="shrink-0 text-xs text-zinc-500">
                    {group.count} ocorrência{group.count > 1 ? "s" : ""} · {group.percentage}%
                  </span>
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-150",
                  isExpanded && "rotate-180",
                )}
              />
            </button>
            {isExpanded ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-800 pt-3">
                {group.jobIds.map((jobId) => (
                  <button
                    key={jobId}
                    type="button"
                    onClick={() => onOpenJob(jobId)}
                    className="rounded border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                  >
                    #{jobId}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
