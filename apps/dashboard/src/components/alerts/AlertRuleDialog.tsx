import { Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { alertMetricMeta, formatAlertThreshold } from "@/lib/queue-helpers";
import { mockQueues } from "@/mocks";
import { useAppStore } from "@/store/useAppStore";
import type { AlertMetricType, AlertRule, QueueSummary, Webhook } from "@/types";

export function AlertRuleDialog({
  open,
  onOpenChange,
  channels,
  initialRule,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Webhook[];
  initialRule?: AlertRule | null;
  onCreate: (rule: Omit<AlertRule, "id">) => void;
  onUpdate?: (id: string, rule: Omit<AlertRule, "id">) => void;
}) {
  function resetAndClose() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose} className="max-w-xl">
      {open ? (
        <AlertRuleForm
          key={initialRule?.id ?? "new"}
          channels={channels}
          initialRule={initialRule ?? null}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onCancel={resetAndClose}
        />
      ) : null}
    </Dialog>
  );
}

function AlertRuleForm({
  channels,
  initialRule,
  onCreate,
  onUpdate,
  onCancel,
}: {
  channels: Webhook[];
  initialRule: AlertRule | null;
  onCreate: (rule: Omit<AlertRule, "id">) => void;
  onUpdate?: (id: string, rule: Omit<AlertRule, "id">) => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(initialRule);
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const connections = useAppStore((s) => s.connections);
  const queues = useAppStore((s) => s.queues);

  const [connectionId, setConnectionId] = useState(
    initialRule?.connectionId ?? activeConnectionId ?? connections[0]?.id ?? "",
  );
  // Filas da conexão selecionada; cai para o catálogo mock em modo demo.
  const availableQueues: QueueSummary[] = useMemo(() => {
    const byConnection = queues.filter((q) => q.connectionId === connectionId);
    return byConnection.length > 0 ? byConnection : mockQueues.filter((q) => q.connectionId === connectionId);
  }, [queues, connectionId]);

  const [queueName, setQueueName] = useState(
    initialRule?.queueName ?? availableQueues[0]?.name ?? "",
  );
  const [metricType, setMetricType] = useState<AlertMetricType>(
    initialRule?.metricType ?? "failed_jobs",
  );
  const [threshold, setThreshold] = useState(
    initialRule ? String(initialRule.threshold) : "50",
  );
  const [webhookId, setWebhookId] = useState(initialRule?.webhookId ?? channels[0]?.id ?? "");

  const selectedWebhook = channels.find((c) => c.id === webhookId);
  const selectedConnection = connections.find((c) => c.id === connectionId);
  const thresholdNumber = Number(threshold);
  const canCreate = Boolean(queueName && webhookId && connectionId && !Number.isNaN(thresholdNumber));

  const sentence = useMemo(() => {
    const metricLabel = alertMetricMeta[metricType].label.toLowerCase();
    return `Se ${metricLabel} da fila "${queueName || "..."}" for maior ou igual a ${
      formatAlertThreshold(metricType, thresholdNumber) || "0"
    }, então disparar alerta para ${
      selectedWebhook ? `"${selectedWebhook.name}"` : "o canal selecionado"
    }.`;
  }, [metricType, queueName, thresholdNumber, selectedWebhook]);

  function handleSubmit() {
    if (!canCreate) return;
    const payload: Omit<AlertRule, "id"> = {
      connectionId,
      queueName,
      metricType,
      threshold: thresholdNumber,
      webhookId,
    };
    if (isEditing && initialRule && onUpdate) {
      onUpdate(initialRule.id, payload);
    } else {
      onCreate(payload);
    }
    onCancel();
  }

  return (
    <>
      <DialogHeader
        title={isEditing ? "Editar Regra de Alerta" : "Nova Regra de Alerta"}
        subtitle="Defina uma condição sobre uma fila para disparar um alerta automaticamente."
        onClose={onCancel}
      />
      <DialogBody>
        <div className="space-y-5">
          <Section label="Gatilho">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Conexão">
                <select
                  value={connectionId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setConnectionId(next);
                    const nextQueues =
                      queues.filter((q) => q.connectionId === next).length > 0
                        ? queues.filter((q) => q.connectionId === next)
                        : mockQueues.filter((q) => q.connectionId === next);
                    setQueueName(nextQueues[0]?.name ?? "");
                  }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.host}:{c.port})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Fila alvo">
                <select
                  value={queueName}
                  onChange={(e) => setQueueName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                >
                  {availableQueues.map((q) => (
                    <option key={q.name} value={q.name}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Métrica monitorada">
                <select
                  value={metricType}
                  onChange={(e) => setMetricType(e.target.value as AlertMetricType)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                >
                  {(Object.keys(alertMetricMeta) as AlertMetricType[]).map((key) => (
                    <option key={key} value={key}>
                      {alertMetricMeta[key].label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={`Limite (${alertMetricMeta[metricType].unit})`}>
                <input
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                />
              </Field>
            </div>
          </Section>

          <Section label="Notificação">
            <Field label="Canal de notificação">
              <select
                value={webhookId}
                onChange={(e) => setWebhookId(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                disabled={channels.length === 0}
              >
                {channels.length === 0 ? (
                  <option value="">Nenhum canal cadastrado</option>
                ) : (
                  channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </Field>
            {connectionId && selectedConnection ? (
              <p className="mt-2 text-xs text-zinc-500">
                Regra vinculada à conexão{" "}
                <span className="font-medium text-zinc-300">{selectedConnection.name}</span>.
              </p>
            ) : null}
          </Section>

          <div className="flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <p className="text-xs leading-relaxed text-zinc-400">{sentence}</p>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSubmit} disabled={!canCreate}>
          {isEditing ? "Salvar alterações" : "Criar regra"}
        </Button>
      </DialogFooter>
    </>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="mb-3.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
