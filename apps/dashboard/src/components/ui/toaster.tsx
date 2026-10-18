import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

import { useToastStore } from "@/store/useToastStore";
import { cn } from "@/lib/utils";

const icons = {
  success: CheckCircle2,
  info: Info,
  danger: TriangleAlert,
} as const;

const iconClasses = {
  success: "text-emerald-400",
  info: "text-blue-400",
  danger: "text-red-400",
} as const;

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.variant];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-lg shadow-black/30"
            >
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", iconClasses[toast.variant])}
              />
              <p className="flex-1 text-sm text-zinc-200">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
