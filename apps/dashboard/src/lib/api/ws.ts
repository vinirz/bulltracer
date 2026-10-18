import type { BullmqEventMessage } from "./types";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15_000;

function resolveWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Cliente WebSocket do BullTracer com reconexão exponencial.
 *
 * O servidor transmite { type: "BULLMQ_EVENT", ... } sempre que um evento
 * BullMQ relevante é capturado pelo Watcher — usado para atualizar os
 * snapshots em tempo real sem polling.
 */
export function connectRealtime(onEvent: (message: BullmqEventMessage) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer: number | null = null;

  function scheduleReconnect() {
    if (closed) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  function connect() {
    if (closed) return;
    try {
      ws = new WebSocket(resolveWsUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectDelay = RECONNECT_BASE_MS;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as BullmqEventMessage;
        if (message?.type === "BULLMQ_EVENT") onEvent(message);
      } catch {
        // mensagem malformada é ignorada — o watch segue vivo
      }
    };

    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return () => {
    closed = true;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  };
}
