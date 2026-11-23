/**
 * Canal temps réel (Socket.IO). Chaque client s'authentifie avec son jeton Bearer
 * dans `auth.token` et rejoint la salle `user:<nom>`.
 *
 * Événements émis vers un utilisateur :
 * - `message.new` : un message le concerne (corps : { id, from }) ;
 * - `conversation.updated` : sa liste de conversations a changé.
 * Le contenu complet n'est jamais poussé : le client recharge via l'API REST.
 */
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { MemoryStore } from "../store/memory.store";

export const roomOf = (username: string): string => `user:${username}`;

@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly store: MemoryStore) {}

  handleConnection(client: Socket): void {
    const token: unknown = client.handshake.auth?.token;
    const session = typeof token === "string" ? this.store.sessions.get(token) : undefined;
    if (!session || session.expiresAt < Date.now()) {
      client.disconnect(true);
      return;
    }
    client.join(roomOf(session.username));
  }

  notify(username: string, event: string, payload: unknown): void {
    this.server?.to(roomOf(username)).emit(event, payload);
  }
  /** Prévient tous les clients connectés qu'une clé publique a changé (sans contenu). */
  broadcastKeyUpdate(username: string): void {
    this.server?.emit("public-key.updated", { username });
  }
}
