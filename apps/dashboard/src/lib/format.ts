export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}min`;
}

export function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h atrás`;
}

export function formatThroughput(jobsPerSecond: number): string {
  return `${jobsPerSecond.toFixed(1)} jobs/s`;
}

/** Horário local `HH:mm:ss`; inclui a data (`dd/MM`) quando não é o mesmo dia de `now`. */
export function formatTimestamp(epochMs: number, now = Date.now()): string {
  const date = new Date(epochMs);
  const time = date.toLocaleTimeString("pt-BR", { hour12: false });
  if (date.toDateString() === new Date(now).toDateString()) return time;
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${time}`;
}
