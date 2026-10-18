import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  function close() {
    onOpenChange(false);
  }

  function handleConfirm() {
    onConfirm();
    close();
  }

  return (
    <Dialog open={open} onOpenChange={close} className="max-w-sm">
      <DialogHeader title={title} onClose={close} />
      {description ? (
        <DialogBody>
          <p className="text-sm text-zinc-400">{description}</p>
        </DialogBody>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={close}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={destructive ? "danger" : "default"}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
