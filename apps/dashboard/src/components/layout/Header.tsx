import { Link, useMatches } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export function Header() {
  const matches = useMatches();

  const crumbs = matches
    .filter((m) => m.pathname !== "/" || matches.length === 1)
    .map((m) => ({
      pathname: m.pathname,
      label: resolveLabel(m.pathname, m.params as Record<string, string>),
    }))
    .filter((c) => c.label);

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-zinc-800 bg-zinc-950/80 px-6 backdrop-blur">
      <nav className="flex items-center gap-1.5 text-sm text-zinc-500">
        <Link to="/" className="transition-colors hover:text-zinc-200">
          BullTracer
        </Link>
        <AnimatePresence mode="popLayout">
          {crumbs.map((crumb, idx) => (
            <motion.span
              key={crumb.pathname}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              <span
                className={
                  idx === crumbs.length - 1
                    ? "text-zinc-200"
                    : "transition-colors hover:text-zinc-200"
                }
              >
                {crumb.label}
              </span>
            </motion.span>
          ))}
        </AnimatePresence>
      </nav>
    </header>
  );
}

function resolveLabel(pathname: string, params: Record<string, string>): string | null {
  if (pathname === "/") return null;
  if (pathname === "/connections") return "Conexões";
  if (pathname === "/settings/alerts") return "Alertas & Webhooks";
  if (pathname.startsWith("/queues/") && params.queueName) return params.queueName;
  return null;
}
