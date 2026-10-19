import { AlertTriangle, Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { parseStackTrace } from "@/lib/stacktrace";
import { cn } from "@/lib/utils";

/**
 * Stack traces do job — um bloco por tentativa que falhou (o BullMQ guarda um
 * item por tentativa). Erro em destaque; frames de dependências esmaecidos.
 */
export function StackTrace({ stacks, failedReason }: { stacks: string[]; failedReason?: string }) {
  const parsed = useMemo(() => stacks.map(parseStackTrace), [stacks]);

  if (stacks.length === 0) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {failedReason ?? "Falha sem mensagem"}
        </p>
        <p className="mt-2 text-xs text-zinc-500">Este job não registrou stack trace.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {parsed.map((stack, index) => (
        <div key={index} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              {parsed.length > 1 ? (
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Tentativa {index + 1}
                </p>
              ) : null}
              <p className="break-words font-medium">
                {stack.name ? <span className="text-red-300">{stack.name}: </span> : null}
                <span className="text-red-400">{stack.message || failedReason}</span>
              </p>
            </div>
            <CopyStackButton text={stacks[index] ?? ""} />
          </div>

          {stack.frames.length > 0 ? (
            <ul className="space-y-0.5 font-mono text-xs leading-relaxed">
              {stack.frames.map((frame, i) => (
                <li key={i} className={cn("break-all", frame.isInternal ? "text-zinc-600" : "text-zinc-300")}>
                  <span className="text-zinc-600">at </span>
                  {frame.isAsync ? <span className="text-zinc-500">async </span> : null}
                  {frame.file ? (
                    <>
                      {frame.fn ? (
                        <span className={frame.isInternal ? "" : "text-zinc-100"}>{frame.fn} </span>
                      ) : null}
                      <span className="text-zinc-500">
                        {frame.fn ? "(" : ""}
                        {frame.file}
                      </span>
                      {frame.line !== undefined ? (
                        <span className={frame.isInternal ? "" : "text-amber-300"}>
                          :{frame.line}:{frame.column}
                        </span>
                      ) : null}
                      <span className="text-zinc-500">{frame.fn ? ")" : ""}</span>
                    </>
                  ) : (
                    frame.raw
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CopyStackButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
      }}
      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      copiar
    </button>
  );
}
