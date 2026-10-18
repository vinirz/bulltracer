import type { WebSocket } from "ws";

import type { Logger } from "pino";
import type { BullMqEventMessage, NotificationSink } from "../domain/events.js";

/**
 * Hub de WebSockets — lado servidor do streaming bidirecional.
 *
 * Rompe o acoplamento entre o Watcher e o Fastify: o Watcher apenas chama
 * `broadcast()`, e o Hub gerencia o conjunto de sockets conectados
 * (adicionar/remover em `connection open/close`, serialização e backpressure
 * best-effort com `readyState`).
 *
 * O socket pode chegar como `ws.WebSocket` (API com `.on`) ou como
 * `WebSocket` padrão EventTarget (addEventListener) — o hub aceita ambos.
 */
export class WebSocketHub implements NotificationSink {
  private readonly sockets = new Set<WebSocket>();

  constructor(private readonly logger: Logger) {}

  get size(): number {
    return this.sockets.size;
  }

  add(socket: WebSocket): void {
    this.sockets.add(socket);
    const onClose = () => this.remove(socket);
    const onError = (error: Error) => {
      this.logger.warn({ err: error }, "Erro em socket WebSocket");
    };
    // API clássica do `ws` vs API padrão EventTarget do navegador/undici.
    if (typeof socket.on === "function") {
      socket.on("close", onClose);
      socket.on("error", onError);
    } else if (typeof socket.addEventListener === "function") {
      const target = socket as unknown as {
        addEventListener(type: string, listener: () => void): void;
      };
      target.addEventListener("close", onClose);
      target.addEventListener("error", () => {
        this.logger.warn({ err: undefined }, "Erro em socket WebSocket (EventTarget)");
      });
    } else {
      this.logger.warn(
        { constructor: (socket as object).constructor?.name },
        "Socket sem API de eventos reconhecida — ignorando close/error",
      );
    }
  }

  remove(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  broadcast(message: BullMqEventMessage): void {
    const payload = JSON.stringify(message);
    for (const socket of this.sockets) {
      // OPEN === 1 no ws; evita lançar em socket fechado/connecting.
      if (socket.readyState === (1 as WebSocket["readyState"])) {
        socket.send(payload);
      }
    }
  }

  close(): void {
    for (const socket of this.sockets) {
      if (typeof socket.close === "function") {
        socket.close(1001, "Server shutdown");
      }
    }
    this.sockets.clear();
  }
}
