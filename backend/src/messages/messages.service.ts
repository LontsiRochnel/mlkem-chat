/**
 * Messages entre utilisateurs :
 * - TEXT : texte clair, 1 à 2000 caractères ;
 * - KEM_CIPHERTEXT : texte encapsulé c (base64), avec variante et empreinte de ek ;
 * - SECURE_TEXT : message chiffré (AES-256-GCM), avec IV et empreinte de la clé.
 *
 * Le serveur ne déchiffre rien et ne vérifie pas la validité cryptographique :
 * il contrôle uniquement les formats et les tailles.
 */
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { decodeBase64Strict } from "../common/crypto.util";
import { CT_SIZES, isVariant, Variant } from "../common/mlkem";
import { MemoryStore, MessageRecord } from "../store/memory.store";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const MAX_TEXT_LENGTH = 2000;
const MAX_SECURE_BYTES = 8192;
const TAG_BYTES = 16;
const IV_BYTES = 12;
const FINGERPRINT_RE = /^[0-9a-f]{16}$/;

export interface ConversationSummary {
  username: string;
  lastMessageAt: string;
  lastMessageKind: MessageRecord["kind"];
}

type NewRecord = Omit<MessageRecord, "id" | "createdAt">;

@Injectable()
export class MessagesService {
  constructor(
    private readonly store: MemoryStore,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Contacts ayant au moins un message avec l'utilisateur, le plus récent d'abord. */
  conversations(me: string): ConversationSummary[] {
    const byContact = new Map<string, ConversationSummary>();
    for (const m of this.store.messages) {
      if (m.from !== me && m.to !== me) continue;
      const other = m.from === me ? m.to : m.from;
      const current = byContact.get(other);
      if (!current || current.lastMessageAt < m.createdAt) {
        byContact.set(other, { username: other, lastMessageAt: m.createdAt, lastMessageKind: m.kind });
      }
    }
    return [...byContact.values()].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  }

  /** Messages échangés avec `other`, du plus ancien au plus récent. */
  thread(me: string, rawOther: string): MessageRecord[] {
    const other = rawOther.toLowerCase();
    return this.store.messages.filter((m) => (m.from === me && m.to === other) || (m.from === other && m.to === me));
  }

  send(me: string, body: Record<string, unknown>): MessageRecord {
    const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    if (!to) {
      throw new BadRequestException("to est requis");
    }
    if (to === me) {
      throw new BadRequestException("Impossible de s'envoyer un message à soi-même");
    }
    if (!this.store.users.has(to)) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: `Utilisateur « ${to} » introuvable.` });
    }

    let fields: NewRecord;
    switch (body.kind) {
      case "TEXT":
        fields = this.buildText(me, to, body.body);
        break;
      case "KEM_CIPHERTEXT":
        fields = this.buildCiphertext(me, to, body);
        break;
      case "SECURE_TEXT":
        fields = this.buildSecure(me, to, body);
        break;
      default:
        throw new BadRequestException("kind doit valoir TEXT, KEM_CIPHERTEXT ou SECURE_TEXT");
    }

    const record: MessageRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...fields };
    this.store.messages.push(record);
    this.realtime.notify(to, "message.new", { id: record.id, from: me });
    this.realtime.notify(to, "conversation.updated", {});
    this.realtime.notify(me, "conversation.updated", {});
    return record;
  }

  private buildText(from: string, to: string, raw: unknown): NewRecord {
    if (typeof raw !== "string" || raw.trim().length === 0) {
      throw new BadRequestException("body doit être un texte non vide");
    }
    if (raw.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(`Message trop long (${MAX_TEXT_LENGTH} caractères maximum)`);
    }
    return { from, to, kind: "TEXT", body: raw, variant: null, ekFingerprint: null, iv: null, keyFingerprint: null };
  }

  private buildCiphertext(from: string, to: string, body: Record<string, unknown>): NewRecord {
    const variant = body.variant;
    const ekFingerprint = body.ekFingerprint;
    const c = body.body;
    if (!isVariant(variant)) {
      throw new BadRequestException("variant doit valoir ML-KEM-512, ML-KEM-768 ou ML-KEM-1024");
    }
    if (typeof ekFingerprint !== "string" || !FINGERPRINT_RE.test(ekFingerprint)) {
      throw new BadRequestException("ekFingerprint doit être 16 caractères hexadécimaux minuscules");
    }
    if (typeof c !== "string") {
      throw new BadRequestException("body doit contenir le texte encapsulé c en base64");
    }
    const bytes = decodeBase64Strict(c);
    if (!bytes) {
      throw new BadRequestException("Le texte encapsulé n'est pas du base64 valide");
    }
    if (bytes.length !== CT_SIZES[variant as Variant]) {
      throw new BadRequestException(`Le texte encapsulé doit faire ${CT_SIZES[variant as Variant]} octets pour ${variant}`);
    }
    return { from, to, kind: "KEM_CIPHERTEXT", body: c, variant, ekFingerprint, iv: null, keyFingerprint: null };
  }

  private buildSecure(from: string, to: string, body: Record<string, unknown>): NewRecord {
    const keyFingerprint = body.keyFingerprint;
    const iv = body.iv;
    const c = body.body;
    if (typeof keyFingerprint !== "string" || !FINGERPRINT_RE.test(keyFingerprint)) {
      throw new BadRequestException("keyFingerprint doit être 16 caractères hexadécimaux minuscules");
    }
    if (typeof iv !== "string") {
      throw new BadRequestException("iv requis (base64)");
    }
    const ivBytes = decodeBase64Strict(iv);
    if (!ivBytes || ivBytes.length !== IV_BYTES) {
      throw new BadRequestException(`iv doit faire ${IV_BYTES} octets en base64`);
    }
    if (typeof c !== "string") {
      throw new BadRequestException("body doit contenir le message chiffré en base64");
    }
    const bytes = decodeBase64Strict(c);
    if (!bytes) {
      throw new BadRequestException("Le message chiffré doit être en base64 valide");
    }
    if (bytes.length < TAG_BYTES || bytes.length > MAX_SECURE_BYTES) {
      throw new BadRequestException("Taille du message chiffré invalide");
    }
    return { from, to, kind: "SECURE_TEXT", body: c, variant: null, ekFingerprint: null, iv, keyFingerprint };
  }
}
