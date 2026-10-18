import { create } from "zustand";

import { api, connectRealtime } from "@/lib/api";
import { mockConnections, mockQueues } from "@/mocks";
import type { JobRecord, QueueSummary, RedisConnection } from "@/types";

export type ApiStatus = "checking" | "online" | "offline";

interface AppState {
  /** Todas as conexões Redis conhecidas (API ou mock em modo demo). */
  connections: RedisConnection[];
  /** ID da conexão atualmente selecionada no Sidebar. */
  activeConnectionId: string | null;
  setActiveConnectionId: (id: string) => void;
  /** Simula a latência de reconexão ao trocar de instância Redis. */
  isSwitchingConnection: boolean;

  /** Filas da conexão ativa (snapshot da API ou mocks em modo demo). */
  queues: QueueSummary[];
  /** Se o servidor BullTracer está acessível. */
  apiStatus: ApiStatus;
  /** Inicializa o app: health check, conexões, filas e realtime. */
  initApp: () => Promise<void>;
  /** Recarrega as filas da conexão ativa (com fallback mock por conexão). */
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

const DEFAULT_MOCK_FOR_CONNECTION = (connectionId: string | null) =>
  mockQueues.filter((q) => q.connectionId === connectionId);

let realtimeStop: (() => void) | null = null;
let reloadDebounceTimer: number | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  connections: mockConnections,
  activeConnectionId: mockConnections[0]?.id ?? null,
  isSwitchingConnection: false,
  queues: mockQueues,
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
    const { apiStatus } = get();
    if (apiStatus !== "online") return;
    try {
      const remote = await api.listConnections();
      const activeConnectionId =
        get().activeConnectionId && remote.some((c) => c.id === get().activeConnectionId)
          ? get().activeConnectionId
          : (remote[0]?.id ?? null);
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
      // API caiu no meio do caminho — mantém o modo demo.
      set({ apiStatus: "offline" });
    }
  },

  reloadQueues: async () => {
    const { apiStatus, activeConnectionId } = get();
    if (apiStatus !== "online" || !activeConnectionId) {
      set({ queues: DEFAULT_MOCK_FOR_CONNECTION(activeConnectionId) });
      return;
    }
    try {
      const snapshots = await api.listQueues(activeConnectionId);
      set({ queues: snapshots.map((s) => snapshotToQueueSummary(s, activeConnectionId)) });
    } catch {
      // Conexão ativa não registrada no servidor (ex: mocks) → fallback demo.
      set({ queues: DEFAULT_MOCK_FOR_CONNECTION(activeConnectionId) });
    }
  },

  setActiveConnectionId: (id) => {
    set({ activeConnectionId: id, isSwitchingConnection: true });
    void get()
      .reloadQueues()
      .finally(() => set({ isSwitchingConnection: false }));
  },

  addConnection: async (connection) => {
    const { apiStatus } = get();
    if (apiStatus === "online") {
      const created = await api.createConnection({
        name: connection.name,
        host: connection.host,
        port: connection.port,
        password: connection.password ?? undefined,
      });
      await get().reloadConnections();
      set({ activeConnectionId: created.id });
      return;
    }
    const id = `conn-${crypto.randomUUID().slice(0, 8)}`;
    set((state) => ({
      connections: [
        ...state.connections,
        { ...connection, id, status: "connected", queueCount: 0 },
      ],
    }));
  },

  updateConnection: async (id, connection) => {
    const { apiStatus } = get();
    if (apiStatus === "online") {
      await api.updateConnection(id, {
        name: connection.name,
        host: connection.host,
        port: connection.port,
        password: connection.password ?? undefined,
      });
      await get().reloadConnections();
      return;
    }
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, ...connection } : c,
      ),
    }));
  },

  removeConnection: async (id) => {
    const { apiStatus } = get();
    if (apiStatus === "online") {
      await api.deleteConnection(id);
      await get().reloadConnections();
      return;
    }
    set((state) => {
      const connections = state.connections.filter((c) => c.id !== id);
      const activeConnectionId =
        state.activeConnectionId === id
          ? (connections[0]?.id ?? null)
          : state.activeConnectionId;
      return { connections, activeConnectionId };
    });
  },

  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),

  selectedJob: null,
  openJobInspector: (job) => set({ selectedJob: job }),
  closeJobInspector: () => set({ selectedJob: null }),
}));
