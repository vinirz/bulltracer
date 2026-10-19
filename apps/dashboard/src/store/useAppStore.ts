import { create } from "zustand";

import { api, connectRealtime } from "@/lib/api";
import type { JobRecord, QueueSummary, RedisConnection } from "@/types";

export type ApiStatus = "checking" | "online" | "offline";

interface AppState {
  /** Todas as conexões Redis cadastradas no servidor. */
  connections: RedisConnection[];
  /** ID da conexão atualmente selecionada (persistido no navegador). */
  activeConnectionId: string | null;
  setActiveConnectionId: (id: string) => void;
  /** Simula a latência de reconexão ao trocar de instância Redis. */
  isSwitchingConnection: boolean;

  /** Filas da conexão ativa (snapshot da API). */
  queues: QueueSummary[];
  /** Mensagem de erro ao listar as filas da conexão ativa (ex.: Redis inacessível); `null` se ok. */
  queuesError: string | null;
  /** Se o servidor BullTracer está acessível. */
  apiStatus: ApiStatus;
  /** Inicializa o app: health check, conexões, filas e realtime. */
  initApp: () => Promise<void>;
  /** Recarrega as filas da conexão ativa. */
  reloadQueues: () => Promise<void>;
  /** Recarrega as conexões a partir da API. */
  reloadConnections: () => Promise<void>;

  addConnection: (connection: Omit<RedisConnection, "id" | "status" | "queueCount">) => Promise<void>;
  updateConnection: (
    id: string,
    connection: Partial<Omit<RedisConnection, "id" | "status" | "queueCount">>,
  ) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;

  /** Estado de abertura do Sidebar (mobile). */
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  /** Job atualmente selecionado para o Job Inspector (Tela 3). */
  selectedJob: JobRecord | null;
  openJobInspector: (job: JobRecord) => void;
  closeJobInspector: () => void;
}

/** Converte o snapshot do backend no modelo de UI do dashboard. */
export function snapshotToQueueSummary(
  snapshot: { queueName: string; waiting: number; active: number; completed: number; failed: number; delayed: number },
  connectionId: string,
): QueueSummary {
  const { waiting, active, completed, failed, delayed } = snapshot;

  const failedRate = failed / Math.max(1, completed + failed);
  let health: QueueSummary["health"] = "healthy";
  if (waiting > 200 || failedRate >= 0.1) health = "critical";
  else if (failedRate >= 0.03 || waiting > 80) health = "warning";

  // Métricas derivadas do snapshot — o backend não expõe séries temporais
  // ainda, então throughput/espera/processamento ficam como estimativas 0
  // e a pressão é proporção de jobs em espera na fila.
  const queuePressure = waiting > 0
    ? Math.min(100, Math.round((waiting / Math.max(1, waiting + active)) * 100))
    : 0;

  return {
    name: snapshot.queueName,
    connectionId,
    health,
    counts: { waiting, active, completed, failed, delayed },
    metrics: { throughput: 0, waitTimeMs: 0, processTimeMs: 0, queuePressure },
  };
}

const ACTIVE_CONNECTION_KEY = "bulltracer:activeConnectionId";

function loadActiveConnectionId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_CONNECTION_KEY);
  } catch {
    return null;
  }
}

function saveActiveConnectionId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(ACTIVE_CONNECTION_KEY, id);
    else window.localStorage.removeItem(ACTIVE_CONNECTION_KEY);
  } catch {
    // armazenamento indisponível (modo privado/bloqueado): segue sem persistir
  }
}

const OFFLINE_MESSAGE = "Servidor BullTracer não acessível.";

let realtimeStop: (() => void) | null = null;
let reloadDebounceTimer: number | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  // Restaura a última conexão escolhida; é validada contra a API em reloadConnections.
  activeConnectionId: loadActiveConnectionId(),
  isSwitchingConnection: false,
  queues: [],
  queuesError: null,
  apiStatus: "checking",

  initApp: async () => {
    try {
      await api.health();
    } catch {
      set({ apiStatus: "offline" });
      return;
    }
    set({ apiStatus: "online" });
    await get().reloadConnections();
    await get().reloadQueues();

    // Realtime: eventos BullMQ do Watcher atualizam os snapshots.
    if (realtimeStop) realtimeStop();
    realtimeStop = connectRealtime(() => {
      const { activeConnectionId, apiStatus } = get();
      if (apiStatus !== "online" || !activeConnectionId) return;
      if (reloadDebounceTimer !== null) window.clearTimeout(reloadDebounceTimer);
      reloadDebounceTimer = window.setTimeout(() => {
        reloadDebounceTimer = null;
        void get().reloadQueues();
      }, 400);
    });
  },

  reloadConnections: async () => {
    if (get().apiStatus !== "online") return;
    try {
      const remote = await api.listConnections();
      const current = get().activeConnectionId;
      const activeConnectionId =
        current && remote.some((c) => c.id === current) ? current : (remote[0]?.id ?? null);
      saveActiveConnectionId(activeConnectionId);
      set({
        connections: remote.map((c) => ({
          id: c.id,
          name: c.name,
          environment: "production",
          host: c.host,
          port: c.port,
          status: "connected",
          queueCount: 0,
        })),
        activeConnectionId,
      });
    } catch {
      // API caiu no meio do caminho.
      set({ apiStatus: "offline" });
    }
  },

  reloadQueues: async () => {
    const { apiStatus, activeConnectionId } = get();
    if (apiStatus !== "online" || !activeConnectionId) {
      set({ queues: [], queuesError: null });
      return;
    }
    try {
      const snapshots = await api.listQueues(activeConnectionId);
      set({
        queues: snapshots.map((s) => snapshotToQueueSummary(s, activeConnectionId)),
        queuesError: null,
      });
    } catch (error) {
      set({
        queues: [],
        queuesError: error instanceof Error ? error.message : "Não foi possível listar as filas.",
      });
    }
  },

  setActiveConnectionId: (id) => {
    saveActiveConnectionId(id);
    set({ activeConnectionId: id, isSwitchingConnection: true });
    void get()
      .reloadQueues()
      .finally(() => set({ isSwitchingConnection: false }));
  },

  addConnection: async (connection) => {
    if (get().apiStatus !== "online") throw new Error(OFFLINE_MESSAGE);
    const created = await api.createConnection({
      name: connection.name,
      host: connection.host,
      port: connection.port,
      password: connection.password ?? undefined,
    });
    await get().reloadConnections();
    get().setActiveConnectionId(created.id);
  },

  updateConnection: async (id, connection) => {
    if (get().apiStatus !== "online") throw new Error(OFFLINE_MESSAGE);
    await api.updateConnection(id, {
      name: connection.name,
      host: connection.host,
      port: connection.port,
      password: connection.password ?? undefined,
    });
    await get().reloadConnections();
    await get().reloadQueues();
  },

  removeConnection: async (id) => {
    if (get().apiStatus !== "online") throw new Error(OFFLINE_MESSAGE);
    await api.deleteConnection(id);
    await get().reloadConnections();
    await get().reloadQueues();
  },

  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),

  selectedJob: null,
  openJobInspector: (job) => set({ selectedJob: job }),
  closeJobInspector: () => set({ selectedJob: null }),
}));
