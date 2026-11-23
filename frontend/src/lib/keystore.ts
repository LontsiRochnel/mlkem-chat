/**
 * Stockage local (IndexedDB), propre à ce navigateur :
 * - keypairs      : paires ML-KEM (dk jamais envoyée au serveur) ;
 * - conversations : mode (clair ou sécurisé) et clé secrète de chaque discussion ;
 * - clear         : texte déchiffré de chaque message, conservé après un changement de clé.
 */
import type { Variant } from "./mlkem";

export interface StoredPair {
  id: string;
  username: string;
  variant: Variant;
  ek: string; // base64
  dk: string; // base64, secret
  fingerprint: string;
  createdAt: string;
}

export interface ConversationSettings {
  id: string;
  owner: string;
  contact: string;
  mode: "plain" | "secure";
  key: string | null; // base64 de K, secret
  keyFingerprint: string | null;
  updatedAt: string;
}

interface ClearEntry {
  id: string;
  owner: string;
  messageId: string;
  plaintext: string;
  decryptedAt: string;
}

const DB_NAME = "mlkem-chat";
const VERSION = 2;
const STORES = ["keypairs", "conversations", "clear"] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        for (const name of STORES) {
          if (!request.result.objectStoreNames.contains(name)) {
            request.result.createObjectStore(name, { keyPath: "id" });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = action(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/* ---------- Paires de clés ---------- */

export async function savePair(pair: StoredPair): Promise<void> {
  await run("keypairs", "readwrite", (s) => s.put(pair));
}

/** Paires d'un utilisateur, de la plus récente à la plus ancienne. */
export async function listPairs(username: string): Promise<StoredPair[]> {
  const all = await run<StoredPair[]>("keypairs", "readonly", (s) => s.getAll());
  return all.filter((p) => p.username === username).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deletePair(id: string): Promise<void> {
  await run("keypairs", "readwrite", (s) => s.delete(id));
}

/* ---------- Discussions ---------- */

export const conversationId = (owner: string, contact: string): string => `${owner}|${contact}`;

export function emptyConversation(owner: string, contact: string): ConversationSettings {
  return {
    id: conversationId(owner, contact),
    owner,
    contact,
    mode: "plain",
    key: null,
    keyFingerprint: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getConversation(owner: string, contact: string): Promise<ConversationSettings | null> {
  const found = await run<ConversationSettings | undefined>("conversations", "readonly", (s) => s.get(conversationId(owner, contact)));
  return found ?? null;
}

export async function saveConversation(settings: ConversationSettings): Promise<void> {
  await run("conversations", "readwrite", (s) => s.put(settings));
}

/* ---------- Texte déchiffré ---------- */

export async function saveClear(owner: string, messageId: string, plaintext: string): Promise<void> {
  const entry: ClearEntry = {
    id: `${owner}|${messageId}`,
    owner,
    messageId,
    plaintext,
    decryptedAt: new Date().toISOString(),
  };
  await run("clear", "readwrite", (s) => s.put(entry));
}

/** Textes déchiffrés de l'utilisateur, indexés par identifiant de message. */
export async function getClearMap(owner: string): Promise<Record<string, string>> {
  const all = await run<ClearEntry[]>("clear", "readonly", (s) => s.getAll());
  return Object.fromEntries(all.filter((e) => e.owner === owner).map((e) => [e.messageId, e.plaintext]));
}
