import { Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function MetricCard({
  icon: Icon,
  label,
  value,
  description,
  formula,
  tone = "default",
  footer,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  description: string;
  formula: string;
  tone?: "default" | "warning" | "danger";
  footer?: ReactNode;
}) {
  const toneClasses = {
    default: "bg-zinc-800/80 text-zinc-300",
    warning: "bg-amber-500/10 text-amber-400",
    danger: "bg-red-500/10 text-red-400",
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </div>
          <Tooltip
            side="bottom"
            content={
              <div className="flex max-w-64 flex-col gap-2">
                <p>{description}</p>
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Fórmula
                  </p>
                  <p className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-center font-serif text-[13px] italic text-zinc-200">
                    {formula}
                  </p>
                </div>
              </div>
            }
          >
            <Info className="h-3.5 w-3.5 cursor-help text-zinc-600 transition-colors hover:text-zinc-400" />
          </Tooltip>
        </div>
        <div>
          <p
            className={cn(
              "font-mono text-xl font-semibold",
              tone === "danger" ? "text-red-400" : tone === "warning" ? "text-amber-400" : "text-zinc-100",
            )}
          >
            {value}
          </p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
        {footer}
      </CardContent>
    </Card>
  );
}
