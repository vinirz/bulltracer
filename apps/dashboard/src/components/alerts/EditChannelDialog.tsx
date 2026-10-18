import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import type { Webhook } from "@/types";

export function EditChannelDialog({
  open,
  onOpenChange,
  channel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: Webhook | null;
  onSave: (id: string, data: { name: string; url: string }) => void;
}) {
  function close() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={close} className="max-w-md">
      {open && channel ? (
        <EditChannelForm
          key={channel.id}
          channel={channel}
          onSave={onSave}
          onCancel={close}
        />
      ) : null}
    </Dialog>
  );
}

function EditChannelForm({
  channel,
  onSave,
  onCancel,
}: {
  channel: Webhook;
  onSave: (id: string, data: { name: string; url: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(channel.name);
  const [url, setUrl] = useState(channel.url);

  function handleSave() {
    if (!name || !url) return;
    onSave(channel.id, { name, url });
    onCancel();
  }

  return (
    <>
      <DialogHeader title="Editar Canal de Notificação" onClose={onCancel} />
      <DialogBody>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-500">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome (ex: Slack #infra)"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-500">
              URL do Webhook
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL do Webhook"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-600"
            />
          </label>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={!name || !url}>
          Salvar alterações
        </Button>
      </DialogFooter>
    </>
  );
}
