/** Connexion temps réel : notifications de messages, de conversations et de clés publiques. */
import { io, type Socket } from "socket.io-client";
import { getSession } from "./api";

export interface RealtimeHandlers {
  onChange: () => void;
  onKeyUpdate?: (username: string) => void;
}

export function connectRealtime(handlers: RealtimeHandlers): Socket | null {
  const token = getSession()?.token;
  if (!token) return null;
  const socket = io({ auth: { token }, transports: ["websocket"] });
  socket.on("message.new", handlers.onChange);
  socket.on("conversation.updated", handlers.onChange);
  socket.on("public-key.updated", (payload: { username: string }) => {
    handlers.onKeyUpdate?.(payload.username);
  });
  return socket;
}
