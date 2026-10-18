import type { JobRecord } from "@/types";

export interface ErrorGroup {
  signature: string;
  count: number;
  percentage: number;
  jobIds: string[];
}

/** Normaliza a mensagem de erro removendo valores variáveis (ids, números). */
function normalizeSignature(reason: string): string {
  return reason
    .split("\n")[0]
    .replace(/["'][\w.-]+["']/g, "<valor>")
    .replace(/\b\d+\b/g, "<n>")
    .trim();
}

export function groupJobErrors(jobs: JobRecord[]): ErrorGroup[] {
  const failedJobs = jobs.filter((job) => job.status === "failed" && job.failedReason);
  const groups = new Map<string, ErrorGroup>();

  for (const job of failedJobs) {
    const signature = normalizeSignature(job.failedReason as string);
    const existing = groups.get(signature);
    if (existing) {
      existing.count += 1;
      existing.jobIds.push(job.id);
    } else {
      groups.set(signature, { signature, count: 1, percentage: 0, jobIds: [job.id] });
    }
  }

  const total = failedJobs.length || 1;
  return Array.from(groups.values())
    .map((group) => ({ ...group, percentage: Number(((group.count / total) * 100).toFixed(1)) }))
    .sort((a, b) => b.count - a.count);
}
