import { cn } from "@/lib/utils";
import { formatMs, formatTimestamp } from "@/lib/format";
import type { TimelineStep } from "@/lib/job-timeline";

const dotTone = {
  default: "bg-zinc-500",
  success: "bg-emerald-400",
  danger: "bg-red-500",
};

/** Linha do tempo vertical do job: marcos (pontos) e intervalos entre eles. */
export function JobTimeline({ steps, now }: { steps: TimelineStep[]; now: number }) {
  return (
    <ol className="relative ml-1.5 border-l border-zinc-800 pl-5">
      {steps.map((step, index) =>
        step.kind === "event" ? (
          <li key={index} className="relative pb-4 last:pb-0">
            <span
              className={cn(
                "absolute -left-[26px] top-1.5 h-2 w-2 rounded-full ring-4 ring-zinc-950",
                dotTone[step.tone ?? "default"],
              )}
            />
            <p className="text-xs text-zinc-500">{step.label}</p>
            <p className={cn("font-mono text-sm", step.tone === "danger" ? "text-red-400" : "text-zinc-200")}>
              {formatTimestamp(step.at, now)}
            </p>
          </li>
        ) : (
          <li key={index} className="pb-4 text-xs italic text-zinc-500">
            {step.label} <span className="font-mono not-italic text-zinc-400">{formatMs(step.ms)}</span>
          </li>
        ),
      )}
    </ol>
  );
}
