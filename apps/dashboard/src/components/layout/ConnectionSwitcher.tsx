import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Loader2, Settings2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

/**
 * Seletor de conexão ativa, estilo "workspace switcher": fica ancorado no
 * rodapé da sidebar, abrindo a lista de conexões para cima.
 */
export function ConnectionSwitcher() {
  const {
    connections,
    activeConnectionId,
    setActiveConnectionId,
    isSwitchingConnection,
  } = useAppStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative border-t border-zinc-800 p-3">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full left-3 right-3 z-20 mb-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
          >
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              Conexão Redis ativa
            </p>
            {connections.map((conn) => {
              const isActive = conn.id === activeConnectionId;
              return (
                <button
                  key={conn.id}
                  type="button"
                  onClick={() => {
                    setActiveConnectionId(conn.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      conn.status === "connected" ? "bg-emerald-400" : "bg-zinc-600",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {conn.name}
                  </span>
                  {isActive ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  ) : null}
                </button>
              );
            })}
            <div className="my-1 border-t border-zinc-800" />
            <Link
              to="/connections"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0" />
              <span>Gerenciar conexões</span>
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-left outline-none transition-colors hover:border-zinc-700 focus-visible:border-zinc-600"
      >
        {isSwitchingConnection ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" />
        ) : (
          <span className="relative flex h-2 w-2 shrink-0">
            {activeConnection?.status === "connected" ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            ) : null}
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                activeConnection?.status === "connected" ? "bg-emerald-400" : "bg-zinc-600",
              )}
            />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-medium text-zinc-200">
            {activeConnection?.name ?? "Selecione uma conexão"}
          </span>
          <span className="block truncate text-[11px] text-zinc-500">
            {isSwitchingConnection
              ? "Conectando..."
              : activeConnection
                ? `${activeConnection.host}:${activeConnection.port}`
                : "—"}
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      </button>
    </div>
  );
}
