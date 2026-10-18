import type { BadgeProps } from "@/components/ui/badge";
import type { AlertMetricType, JobStatus, QueueHealth } from "@/types";

export const healthLabel: Record<QueueHealth, string> = {
  healthy: "Saudável",
  warning: "Atenção",
  critical: "Crítico",
};

export const healthVariant: Record<QueueHealth, NonNullable<BadgeProps["variant"]>> = {
  healthy: "success",
  warning: "warning",
  critical: "danger",
};

export const healthDotClass: Record<QueueHealth, string> = {
  healthy: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
};

export const statusLabel: Record<JobStatus, string> = {
  waiting: "Aguardando",
  active: "Ativo",
  completed: "Concluído",
  failed: "Falhou",
  delayed: "Atrasado",
};

export const statusVariant: Record<JobStatus, NonNullable<BadgeProps["variant"]>> = {
  waiting: "warning",
  active: "info",
  completed: "success",
  failed: "danger",
  delayed: "outline",
};

export function queuePressureColor(pressure: number): string {
  if (pressure >= 80) return "bg-red-500";
  if (pressure >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

export function queuePressureLabel(pressure: number): string {
  if (pressure >= 80) return `${pressure}% · Risco de gargalo`;
  if (pressure >= 50) return `${pressure}% · Atenção`;
  return `${pressure}% · Normal`;
}

/** Paleta estável de cores por fila, usada no gráfico unificado de throughput. */
const queueColorPalette = [
  "#60a5fa", // blue-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f472b6", // pink-400
  "#a78bfa", // violet-400
  "#22d3ee", // cyan-400
  "#fb923c", // orange-400
];

export function queueColor(index: number): string {
  return queueColorPalette[index % queueColorPalette.length] ?? "#60a5fa";
}

export const alertMetricMeta: Record<AlertMetricType, { label: string; unit: string }> = {
  failed_jobs: { label: "Jobs Falhados", unit: "jobs" },
  wait_time_exceeded: { label: "Tempo de Espera Excedido", unit: "ms" },
};

/** Formata o limiar de uma regra para exibição (ms → s quando conveniente). */
export function formatAlertThreshold(metricType: AlertMetricType, threshold: number): string {
  if (metricType === "wait_time_exceeded" && threshold >= 1000) {
    return `${threshold / 1000}s`;
  }
  return String(threshold);
}

export const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Escala de 5 níveis (estilo GitHub) para colorir uma célula do heatmap. */
const heatmapScales = {
  volume: ["bg-zinc-800", "bg-emerald-900", "bg-emerald-700", "bg-emerald-500", "bg-emerald-400"],
  failureRate: ["bg-zinc-800", "bg-yellow-600", "bg-orange-600", "bg-red-600", "bg-red-900"],
};

export function heatmapLevelClass(
  intensity: number,
  metric: keyof typeof heatmapScales = "volume",
): string {
  const level =
    intensity <= 0 ? 0 : intensity < 0.25 ? 1 : intensity < 0.5 ? 2 : intensity < 0.75 ? 3 : 4;
  return heatmapScales[metric][level];
}
