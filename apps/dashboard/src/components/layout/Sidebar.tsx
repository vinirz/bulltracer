import { Link, useLocation } from "@tanstack/react-router";
import { Bell, LayoutGrid } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { ConnectionSwitcher } from "@/components/layout/ConnectionSwitcher";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { useShallow } from "zustand/react/shallow";

const navItems = [
  { to: "/", label: "Visão Geral", icon: LayoutGrid },
  { to: "/settings/alerts", label: "Alertas & Webhooks", icon: Bell },
] as const;

export function Sidebar() {
  const location = useLocation();
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const activeQueues = useAppStore(
    useShallow((s) => s.queues.filter((q) => q.connectionId === s.activeConnectionId)),
  );

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg">
          <img src="/icon.svg" alt="BullTracer" className="h-6 w-6" />
        </div>
        <span className="font-mono text-md font-semibold text-zinc-100">BullTracer</span>
      </div>

      <nav className="flex flex-col gap-0.5 p-3">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-100",
                isActive && "text-zinc-100",
              )}
            >
              {isActive ? (
                <motion.span
                  layoutId="sidebar-nav-active"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  className="absolute inset-0 rounded-lg bg-zinc-900"
                />
              ) : (
                <span className="absolute inset-0 rounded-lg transition-colors duration-150 hover:bg-zinc-900/60" />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-2 flex-1 overflow-y-auto border-t border-zinc-800 p-3">
        <p className="mb-1.5 px-1 text-xs font-medium text-zinc-500">Filas ativas</p>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeConnectionId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-0.5"
          >
            {activeQueues.map((queue) => {
              const isActiveQueue = location.pathname === `/queues/${queue.name}`;
              return (
                <Link
                  key={queue.name}
                  to="/queues/$queueName"
                  params={{ queueName: queue.name }}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-transparent px-3 py-1.5 font-mono text-xs text-zinc-400 transition-colors duration-150 hover:bg-zinc-900 hover:text-zinc-100",
                    isActiveQueue &&
                      "border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200",
                  )}
                >
                  <span className="truncate">{queue.name}</span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      queue.health === "healthy" && "bg-emerald-400",
                      queue.health === "warning" && "bg-amber-400",
                      queue.health === "critical" && "bg-red-400",
                    )}
                  />
                </Link>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <ConnectionSwitcher />
    </aside>
  );
}
