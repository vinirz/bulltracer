import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, Pencil, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { AddConnectionDialog } from "@/components/connections/AddConnectionDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { useToastStore } from "@/store/useToastStore";
import type { RedisConnection } from "@/types";

export const Route = createFileRoute("/connections")({
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { connections, activeConnectionId, setActiveConnectionId, removeConnection } =
    useAppStore();
  const push = useToastStore((s) => s.push);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<RedisConnection | null>(null);
  const [connectionPendingDelete, setConnectionPendingDelete] =
    useState<RedisConnection | null>(null);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Gestão de Conexões</h1>
          <p className="text-sm text-zinc-500">
            Gerencie as instâncias Redis monitoradas pelo BullTracer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-[background-color,transform] duration-150 hover:bg-white active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" />
          Adicionar Nova Conexão
        </button>
      </div>

      <AddConnectionDialog
        open={dialogOpen || Boolean(editingConnection)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setDialogOpen(false);
            setEditingConnection(null);
          }
        }}
        editConnection={editingConnection}
      />

      <ConfirmDialog
        open={Boolean(connectionPendingDelete)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConnectionPendingDelete(null);
        }}
        title="Remover conexão"
        description={
          connectionPendingDelete
            ? `Tem certeza que deseja remover a conexão "${connectionPendingDelete.name}"? Essa ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          if (connectionPendingDelete) {
            void removeConnection(connectionPendingDelete.id)
              .then(() => {
                push(`Conexão "${connectionPendingDelete.name}" removida.`, "info");
              })
              .catch((error: unknown) => {
                push(
                  `Falha ao remover a conexão: ${error instanceof Error ? error.message : String(error)}`,
                  "danger",
                );
              });
          }
        }}
      />

      {connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20 text-center">
          <Database className="mb-3 h-8 w-8 text-zinc-600" />
          <p className="text-sm text-zinc-400">Nenhuma conexão cadastrada ainda.</p>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="mt-4 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
          >
            Adicionar Nova Conexão
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {connections.map((conn, index) => {
            const isActive = conn.id === activeConnectionId;
            return (
              <motion.div
                key={conn.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -2 }}
              >
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveConnectionId(conn.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setActiveConnectionId(conn.id);
                  }}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden transition-colors duration-200 hover:border-zinc-700 hover:shadow-lg hover:shadow-black/20",
                    isActive && "border-zinc-600 ring-1 ring-zinc-600",
                  )}
                >
                  <CardHeader>
                    <CardTitle className="flex min-w-0 items-center gap-2 font-sans text-base">
                      <Database className="h-4 w-4 shrink-0 text-zinc-500" />
                      <span className="truncate">{conn.name}</span>
                    </CardTitle>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge
                        variant={conn.status === "connected" ? "success" : "outline"}
                        pulse={conn.status === "connected"}
                      >
                        {conn.status === "connected" ? "Conectado" : "Desconectado"}
                      </Badge>
                      {isActive ? (
                        <div
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-zinc-900"
                          aria-label="Conexão ativa"
                        >
                          <Check className="h-3 w-3" />
                        </div>
                      ) : null}
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingConnection(conn);
                          }}
                          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                          aria-label={`Editar ${conn.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConnectionPendingDelete(conn);
                          }}
                          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          aria-label={`Remover ${conn.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-xs text-zinc-500">
                    <p className="font-mono">
                      {conn.host}:{conn.port}
                    </p>
                    <p className="capitalize">Ambiente: {conn.environment}</p>
                    <p>{conn.queueCount} filas monitoradas</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
