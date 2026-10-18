import { CheckCircle2, Loader2, Plug, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  parseRedisUrl,
  testRedisConnection,
  type ConnectionTestResult,
} from "@/lib/connection-helpers";
import { useAppStore } from "@/store/useAppStore";
import { useToastStore } from "@/store/useToastStore";
import type { RedisConnection } from "@/types";

interface FormState {
  name: string;
  url: string;
  host: string;
  port: string;
  username: string;
  password: string;
}

const initialForm: FormState = {
  name: "",
  url: "",
  host: "",
  port: "6379",
  username: "",
  password: "",
};

export function AddConnectionDialog({
  open,
  onOpenChange,
  editConnection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editConnection?: RedisConnection | null;
}) {
  function close() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      {open ? (
        <ConnectionForm
          key={editConnection?.id ?? "new"}
          editConnection={editConnection ?? null}
          onClose={close}
        />
      ) : null}
    </Dialog>
  );
}

function ConnectionForm({
  editConnection,
  onClose,
}: {
  editConnection: RedisConnection | null;
  onClose: () => void;
}) {
  const addConnection = useAppStore((s) => s.addConnection);
  const updateConnection = useAppStore((s) => s.updateConnection);
  const push = useToastStore((s) => s.push);
  const isEditing = Boolean(editConnection);

  const [mode, setMode] = useState<"url" | "manual">(editConnection ? "manual" : "url");
  const [form, setForm] = useState<FormState>(
    editConnection
      ? {
          ...initialForm,
          name: editConnection.name,
          host: editConnection.host,
          port: String(editConnection.port),
          username: editConnection.username ?? "",
        }
      : initialForm,
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  function resetAndClose() {
    onClose();
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  }

  function resolveTarget(): { host: string; port: number; username?: string; password?: string } | null {
    if (mode === "url") {
      const parsed = parseRedisUrl(form.url);
      if (!parsed) return null;
      return { host: parsed.host, port: parsed.port, username: parsed.username, password: parsed.password };
    }
    const port = Number(form.port);
    if (!form.host || !port) return null;
    return {
      host: form.host,
      port,
      username: form.username || undefined,
      password: form.password || undefined,
    };
  }

  async function handleTest() {
    const target = resolveTarget();
    if (!target) {
      push("Preencha os dados de conexão corretamente antes de testar.", "danger");
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await testRedisConnection(target);
    setTesting(false);
    setTestResult(result);
    push(result.message, result.ok ? "success" : "danger");
  }

  async function handleSave() {
    const target = resolveTarget();
    if (!target || !form.name.trim()) return;
    try {
      if (isEditing && editConnection) {
        await updateConnection(editConnection.id, {
          name: form.name.trim(),
          host: target.host,
          port: target.port,
          username: target.username,
          // Senha vazia na edição = manter a atual (o servidor não sobrescreve).
          password: target.password,
        });
        push(`Conexão "${form.name.trim()}" atualizada.`, "success");
      } else {
        await addConnection({
          name: form.name.trim(),
          environment: "development",
          host: target.host,
          port: target.port,
          username: target.username,
          password: target.password,
        });
        push(`Conexão "${form.name.trim()}" adicionada.`, "success");
      }
    } catch (error) {
      push(
        `Falha ao ${isEditing ? "atualizar" : "salvar"} a conexão: ${error instanceof Error ? error.message : String(error)}`,
        "danger",
      );
      return;
    }
    resetAndClose();
  }

  const canSave = isEditing
    ? Boolean(form.name.trim() && resolveTarget())
    : Boolean(testResult?.ok && form.name.trim());

  return (
    <>
      <DialogHeader
        title={isEditing ? "Editar Conexão" : "Adicionar Nova Conexão"}
        subtitle={
          isEditing
            ? "Atualize os dados desta instância Redis."
            : "Configure uma nova instância Redis para monitorar."
        }
        onClose={resetAndClose}
      />
      <DialogBody>
        <div className="space-y-4">
          <Field label="Nome da conexão">
            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="ex: Produção EU"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
            />
          </Field>

          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "url" | "manual")}
          >
            <TabsList>
              <TabsTrigger value="url">Via URL</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="url">
              <Field label="URL de conexão">
                <input
                  value={form.url}
                  onChange={(e) => updateField("url", e.target.value)}
                  placeholder="redis://usuario:senha@host:6379"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                />
              </Field>
            </TabsContent>

            <TabsContent value="manual">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Host" className="sm:col-span-2">
                  <input
                    value={form.host}
                    onChange={(e) => updateField("host", e.target.value)}
                    placeholder="redis.internal"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                  />
                </Field>
                <Field label="Porta">
                  <input
                    value={form.port}
                    onChange={(e) => updateField("port", e.target.value)}
                    placeholder="6379"
                    inputMode="numeric"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                  />
                </Field>
                <Field label="Username (opcional)">
                  <input
                    value={form.username}
                    onChange={(e) => updateField("username", e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                  />
                </Field>
                <Field label="Password (opcional)" className="sm:col-span-2">
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    placeholder={
                      isEditing ? "Deixe em branco para manter a senha atual" : "Senha do Redis"
                    }
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
                  />
                </Field>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center gap-2 text-xs">
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  <span className="text-zinc-400">Testando conexão...</span>
                </>
              ) : testResult ? (
                <>
                  {testResult.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <span className={testResult.ok ? "text-emerald-400" : "text-red-400"}>
                    {testResult.message}
                  </span>
                </>
              ) : (
                <>
                  <Plug className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-zinc-500">
                    Teste a conexão antes de salvar.
                  </span>
                </>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
            >
              Testar conexão
            </Button>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={resetAndClose}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
          {isEditing ? "Salvar alterações" : "Salvar conexão"}
        </Button>
      </DialogFooter>
    </>
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
