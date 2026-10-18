import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import {
  healthDotClass,
  healthLabel,
  healthVariant,
  queuePressureColor,
  queuePressureLabel,
} from "@/lib/queue-helpers";
import { cn } from "@/lib/utils";
import type { QueueSummary } from "@/types";

export function QueueCard({ queue }: { queue: QueueSummary }) {
  const { counts, metrics } = queue;
  const isCritical = queue.health === "critical";

  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="h-full"
    >
      <Link
        to="/queues/$queueName"
        params={{ queueName: queue.name }}
        aria-label={`Analisar fila ${queue.name}`}
        className={cn(
          "group flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm outline-none transition-colors duration-200",
          "hover:border-zinc-700 hover:shadow-lg hover:shadow-black/20 focus-visible:border-zinc-600",
          isCritical && "border-red-500/20",
        )}
      >
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 p-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              {isCritical ? (
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    healthDotClass[queue.health],
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  healthDotClass[queue.health],
                )}
              />
            </span>
            <h3 className="truncate font-mono text-sm font-semibold text-zinc-100">
              {queue.name}
            </h3>
          </div>
          <Badge
            variant={healthVariant[queue.health]}
            className="shrink-0"
          >
            {healthLabel[queue.health]}
          </Badge>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-950/40 p-2.5 text-center">
            <CountBadge
              label="Waiting"
              value={counts.waiting}
              className="text-amber-400"
            />
            <CountBadge label="Active" value={counts.active} className="text-blue-400" />
            <CountBadge label="Failed" value={counts.failed} className="text-red-400" />
          </div>

          <div className="mt-auto">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <Tooltip content="Pressão = jobs em espera ÷ vazão atual. Acima de 80% indica risco de gargalo.">
                <span
                  className="cursor-help text-zinc-500 underline decoration-dotted decoration-zinc-700 underline-offset-2"
                  onClick={(e) => e.preventDefault()}
                >
                  Pressão da fila
                </span>
              </Tooltip>
              <span
                className={cn(
                  "font-medium",
                  metrics.queuePressure >= 80
                    ? "text-red-400"
                    : metrics.queuePressure >= 50
                      ? "text-amber-400"
                      : "text-emerald-400",
                )}
              >
                {queuePressureLabel(metrics.queuePressure)}
              </span>
            </div>
            <Progress
              value={metrics.queuePressure}
              indicatorClassName={queuePressureColor(metrics.queuePressure)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800/80 px-4 py-2.5 text-xs font-medium text-zinc-500 transition-colors duration-150 group-hover:text-zinc-200">
          Analisar fila
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </Link>
    </motion.div>
  );
}

function CountBadge({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div>
      <p className={cn("font-mono text-sm font-semibold", className)}>
        <AnimatedNumber value={value} />
      </p>
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
    </div>
  );
}

