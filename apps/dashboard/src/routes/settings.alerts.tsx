import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { AlertRuleDialog } from "@/components/alerts/AlertRuleDialog";
import { EditChannelDialog } from "@/components/alerts/EditChannelDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { alertMetricMeta, formatAlertThreshold } from "@/lib/queue-helpers";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import { useToastStore } from "@/store/useToastStore";
import type { AlertMetricType, AlertRule, Webhook } from "@/types";

export const Route = createFileRoute("/settings/alerts")({
  component: AlertsPage,
});

const METRIC_LABELS: Record<AlertMetricType, string> = {
  failed_jobs: "Jobs Falhados",
  wait_time_exceeded: "Tempo de Espera Excedido",
};

function AlertsPage() {
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channels, setChannels] = useState<Webhook[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [editingChannel, setEditingChannel] = useState<Webhook | null>(null);
  const [channelPendingDelete, setChannelPendingDelete] = useState<Webhook | null>(null);
  const [rulePendingDelete, setRulePendingDelete] = useState<AlertRule | null>(null);
  const [loading, setLoading] = useState(true);
  const push = useToastStore((s) => s.push);
  const apiStatus = useAppStore((s) => s.apiStatus);
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const activeConnection = useAppStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  // Regras são por conexão: a tela mostra só as da conexão ativa. Canais são compartilhados.
  const visibleRules = rules.filter((r) => r.connectionId === activeConnectionId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (apiStatus === "online") {
        try {
          const [remoteChannels, remoteRules] = await Promise.all([
            api.listWebhooks(),
            api.listAlertRules(),
          ]);
          if (cancelled) return;
          setChannels(remoteChannels);
          setRules(remoteRules);
        } catch {
          if (!cancelled) push("Falha ao carregar alertas do servidor.", "danger");
        }
      } else if (!cancelled) {
        setChannels([]);
        setRules([]);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiStatus, push]);

  function errorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    return error instanceof Error ? error.message : String(error);
  }

  async function addChannel() {
    if (!webhookName || !webhookUrl) return;
    try {
      const created = await api.createWebhook({ name: webhookName, url: webhookUrl });
      setChannels((prev) => [...prev, created]);
      push(`Canal "${webhookName}" adicionado.`, "success");
      setWebhookName("");
      setWebhookUrl("");
    } catch (error) {
      push(`Falha ao adicionar canal: ${errorMessage(error)}`, "danger");
    }
  }

  async function removeChannel(channel: Webhook) {
    try {
      await api.deleteWebhook(channel.id);
      setChannels((prev) => prev.filter((c) => c.id !== channel.id));
      setRules((prev) => prev.filter((r) => r.webhookId !== channel.id));
      push(`Canal "${channel.name}" removido.`, "info");
    } catch (error) {
      push(`Falha ao remover canal: ${errorMessage(error)}`, "danger");
    }
  }

  async function updateChannel(id: string, data: { name: string; url: string }) {
    try {
      const updated = await api.updateWebhook(id, data);
      setChannels((prev) => prev.map((c) => (c.id === id ? updated : c)));
      push(`Canal "${data.name}" atualizado.`, "success");
    } catch (error) {
      push(`Falha ao atualizar canal: ${errorMessage(error)}`, "danger");
    }
  }

  async function createRule(rule: Omit<AlertRule, "id">) {
    try {
      const created = await api.createAlertRule(rule);
      setRules((prev) => [...prev, created]);
      push(`Regra para "${rule.queueName}" criada.`, "success");
    } catch (error) {
      push(`Falha ao criar regra: ${errorMessage(error)}`, "danger");
    }
  }

  async function updateRule(id: string, rule: Omit<AlertRule, "id">) {
    try {
      const updated = await api.updateAlertRule(id, rule);
      setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
      push(`Regra para "${rule.queueName}" atualizada.`, "success");
    } catch (error) {
      push(`Falha ao atualizar regra: ${errorMessage(error)}`, "danger");
    }
  }

  async function removeRule(rule: AlertRule) {
    try {
      await api.deleteAlertRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      push(`Regra para "${rule.queueName}" removida.`, "info");
    } catch (error) {
      push(`Falha ao remover regra: ${errorMessage(error)}`, "danger");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Alertas & Webhooks</h1>
        <p className="text-sm text-zinc-500">
          Canais de notificação são compartilhados entre conexões; as regras de alerta pertencem a
          cada conexão.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base">Canais de Notificação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addChannel();
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={webhookName}
              onChange={(e) => setWebhookName(e.target.value)}
              placeholder="Nome (ex: Slack #infra)"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
            />
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="URL do Webhook"
              className="flex-[2] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-[background-color,transform] duration-150 hover:bg-white active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </form>

          {loading ? (
            <p className="py-4 text-center text-sm text-zinc-600">Carregando...</p>
          ) : channels.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 py-6 text-center text-sm text-zinc-500">
              Nenhum canal cadastrado ainda.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {channels.map((wh) => (
                <motion.div
                  key={wh.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onDoubleClick={() => setEditingChannel(wh)}
                  title="Duplo clique para editar"
                  className="group flex cursor-default select-none items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-900/50"
                >
                  <WebhookIcon className="h-4 w-4 text-zinc-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200">{wh.name}</p>
                    <p className="truncate font-mono text-xs text-zinc-500">{wh.url}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setEditingChannel(wh)}
                      className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                      aria-label={`Editar ${wh.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannelPendingDelete(wh)}
                      className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      aria-label={`Remover ${wh.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="font-sans text-base">Regras de Alerta</CardTitle>
            <p className="mt-0.5 text-xs text-zinc-500">
              {activeConnection
                ? `Conexão: ${activeConnection.name} (${activeConnection.host}:${activeConnection.port})`
                : "Nenhuma conexão selecionada."}
            </p>
          </div>
          <button
            type="button"
            disabled={!activeConnection}
            onClick={() => setRuleDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors duration-150 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Regra
          </button>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Fila Alvo</th>
                  <th className="px-4 py-2.5 font-medium">Métrica</th>
                  <th className="px-4 py-2.5 font-medium">Limite</th>
                  <th className="px-4 py-2.5 font-medium">Canal</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {visibleRules.map((rule) => {
                  const webhook = channels.find((w) => w.id === rule.webhookId);
                  return (
                    <motion.tr
                      key={rule.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="cursor-default select-none transition-colors duration-150 hover:bg-zinc-900/40"
                      onDoubleClick={() => setEditingRule(rule)}
                      title="Duplo clique para editar"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">
                        {rule.queueName}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-400">
                        {METRIC_LABELS[rule.metricType] ?? alertMetricMeta[rule.metricType].label}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-400">
                        <span className="font-mono text-zinc-300">
                          ≥ {formatAlertThreshold(rule.metricType, rule.threshold)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-400">
                        {webhook?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px] text-emerald-400">
                            Ativa
                          </Badge>
                          <button
                            type="button"
                            onClick={() => setEditingRule(rule)}
                            className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                            aria-label={`Editar regra de ${rule.queueName}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRulePendingDelete(rule)}
                            className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                            aria-label={`Remover regra de ${rule.queueName}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && visibleRules.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                {activeConnection
                  ? "Nenhuma regra de alerta para esta conexão."
                  : "Selecione uma conexão para ver as regras de alerta."}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <AlertRuleDialog
        open={ruleDialogOpen || Boolean(editingRule)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRuleDialogOpen(false);
            setEditingRule(null);
          }
        }}
        channels={channels}
        initialRule={editingRule}
        onCreate={(rule) => void createRule(rule)}
        onUpdate={(id, rule) => void updateRule(id, rule)}
      />

      <EditChannelDialog
        open={Boolean(editingChannel)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingChannel(null);
        }}
        channel={editingChannel}
        onSave={(id, data) => {
          void updateChannel(id, data);
        }}
      />

      <ConfirmDialog
        open={Boolean(channelPendingDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setChannelPendingDelete(null);
        }}
        title="Remover canal de notificação"
        description={
          channelPendingDelete
            ? `Tem certeza que deseja remover o canal "${channelPendingDelete.name}"? Regras vinculadas a ele também serão removidas.`
            : undefined
        }
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          if (channelPendingDelete) void removeChannel(channelPendingDelete);
        }}
      />

      <ConfirmDialog
        open={Boolean(rulePendingDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRulePendingDelete(null);
        }}
        title="Remover regra de alerta"
        description={
          rulePendingDelete
            ? `Tem certeza que deseja remover a regra da fila "${rulePendingDelete.queueName}"? Essa ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          if (rulePendingDelete) void removeRule(rulePendingDelete);
        }}
      />
    </div>
  );
}
