import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { JobInspector } from "@/components/jobs/JobInspector";
import { RefreshCw } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { useAppStore } from "@/store/useAppStore";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const location = useLocation();
  const apiStatus = useAppStore((s) => s.apiStatus);
  const initApp = useAppStore((s) => s.initApp);

  // Bootstrap: health check → conexões → filas → websocket.
  useEffect(() => {
    void initApp();
  }, [initApp]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        {apiStatus === "offline" ? (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/5 px-6 py-1.5 text-xs text-amber-400">
            <span>
              Servidor BullTracer não acessível. Verifique se ele está em execução e tente reconectar.
            </span>
            <button
              type="button"
              onClick={() => void initApp()}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-medium text-amber-300 transition-colors hover:bg-amber-500/10"
            >
              <RefreshCw className="h-3 w-3" />
              Reconectar
            </button>
          </div>
        ) : null}
        <main className="relative flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <JobInspector />
      <Toaster />
    </div>
  );
}
