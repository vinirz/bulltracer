import { useMemo, useState } from "react";
import { Info } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { dayLabels, heatmapLevelClass } from "@/lib/queue-helpers";
import type { HeatmapCellDto } from "@/lib/api/types";

const metricOptions = [
  {
    value: "volume" as const,
    label: "Volume de jobs",
    description: "Quantidade de jobs criados nesta fila em cada combinação de dia e horário.",
  },
  {
    value: "failureRate" as const,
    label: "Taxa de falha",
    description:
      "Percentual de jobs que falharam em cada combinação de dia e horário, em relação ao volume do período.",
  },
];

export function QueueHeatmap({ cells }: { cells: HeatmapCellDto[] }) {
  const [metric, setMetric] = useState<"volume" | "failureRate">("volume");
  const activeOption = metricOptions.find((option) => option.value === metric)!;

  const maxValue = useMemo(
    () => Math.max(1, ...cells.map((cell) => (metric === "volume" ? cell.volume : cell.failureRate))),
    [cells, metric],
  );

  const grid = useMemo(() => {
    const byKey = new Map(cells.map((cell) => [`${cell.day}-${cell.hour}`, cell]));
    return Array.from({ length: 7 }, (_, day) =>
      Array.from({ length: 24 }, (_, hour) => byKey.get(`${day}-${hour}`)),
    );
  }, [cells]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          {metricOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMetric(option.value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                metric === option.value
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Tooltip content={activeOption.description} side="bottom">
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            <Info className="h-3.5 w-3.5" />
            Como é calculado
          </span>
        </Tooltip>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="min-w-[640px]">
          <p className="mb-1 ml-9 text-[10px] text-zinc-600">Hora do dia</p>
          <div className="mb-1 ml-9 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="text-center text-[10px] text-zinc-600">
                {hour % 3 === 0 ? `${hour}h` : ""}
              </span>
            ))}
          </div>
          {grid.map((row, day) => (
            <div key={day} className="mb-[3px] flex items-center gap-1">
              <span className="w-8 shrink-0 text-right text-[10px] text-zinc-500">
                {dayLabels[day]}
              </span>
              <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
                {row.map((cell, hour) => {
                  const value = cell ? (metric === "volume" ? cell.volume : cell.failureRate) : 0;
                  const intensity = value / maxValue;
                  const swatch = (
                    <div
                      className={cn(
                        "aspect-square w-full rounded-[3px]",
                        heatmapLevelClass(intensity, metric),
                      )}
                    />
                  );
                  return (
                    <div key={hour} className="relative">
                      {cell ? (
                        <Tooltip
                          side="top"
                          className="flex w-full"
                          content={
                            <span className="flex flex-col">
                              <span className="font-medium text-zinc-100">
                                {dayLabels[day]} às {hour}h
                              </span>
                              <span className="text-zinc-400">
                                {metric === "volume"
                                  ? `${cell.volume} jobs`
                                  : `${cell.failureRate}% de falha`}
                              </span>
                            </span>
                          }
                        >
                          {swatch}
                        </Tooltip>
                      ) : (
                        swatch
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-zinc-600">
            <span>Menos</span>
            {[0, 0.2, 0.45, 0.7, 0.95].map((level) => (
              <span
                key={level}
                className={cn("h-2.5 w-2.5 rounded-[2px]", heatmapLevelClass(level, metric))}
              />
            ))}
            <span>Mais</span>
          </div>
        </div>
      </div>
    </div>
  );
}
