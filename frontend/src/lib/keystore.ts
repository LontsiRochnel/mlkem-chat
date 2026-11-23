/**
 * Stockage local des paires de clés (IndexedDB). La clé privée dk ne quitte jamais
 * le navigateur. Toutes les paires générées sont conservées, pour lire les anciens
 * textes encapsulés.
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

const DB_NAME = "mlkem-chat";
const STORE = "keypairs";
let dbPromise: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function savePair(pair: StoredPair): Promise<void> {
  await run("readwrite", (store) => store.put(pair));
}

/** Paires d'un utilisateur, de la plus récente à la plus ancienne. */
export async function listPairs(username: string): Promise<StoredPair[]> {
  const all = await run<StoredPair[]>("readonly", (store) => store.getAll());
  return all.filter((p) => p.username === username).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deletePair(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
}
