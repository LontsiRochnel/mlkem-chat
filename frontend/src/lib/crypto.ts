/**
 * Chiffrement des messages : AES-256-GCM, clé dérivée du secret K par HKDF-SHA256.
 * Les données associées (AAD) lient le message à l'expéditeur et au destinataire :
 * un message copié vers une autre discussion ne se déchiffre pas.
 */
import { fromBase64, toBase64, toHex } from "./base64";

/** Copie dans un tampon « ArrayBuffer » simple, accepté par crypto.subtle. */
const own = (u: Uint8Array) => {
  const copy = new Uint8Array(u.byteLength);
  copy.set(u);
  return copy;
};

const SALT = own(new Uint8Array(32));
const INFO = own(new TextEncoder().encode("mlkem-chat/aes-256-gcm/v1"));

export function assertCryptoAvailable(): void {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Chiffrement indisponible : ouvrez l'application en localhost ou en HTTPS.");
  }
}

async function deriveKey(secret: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", own(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: SALT, info: INFO }, base, { name: "AES-GCM", length: 256 }, false, usage);
}

/** Empreinte d'une clé secrète : 16 caractères hexadécimaux (SHA-256 tronqué). */
export async function secretFingerprint(secret: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", own(secret));
  return toHex(new Uint8Array(digest)).slice(0, 16);
}

const aad = (from: string, to: string) => own(new TextEncoder().encode(`${from}|${to}`));

export async function encryptText(secret: Uint8Array, from: string, to: string, plaintext: string): Promise<{ iv: string; body: string }> {
  assertCryptoAvailable();
  const key = await deriveKey(secret, ["encrypt"]);
  const iv = own(crypto.getRandomValues(new Uint8Array(12)));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(from, to) }, key, own(new TextEncoder().encode(plaintext)));
  return { iv: toBase64(iv), body: toBase64(new Uint8Array(sealed)) };
}

/** Lève une erreur si la clé ne correspond pas (le tag GCM ne vérifie pas). */
export async function decryptText(secret: Uint8Array, from: string, to: string, ivB64: string, bodyB64: string): Promise<string> {
  assertCryptoAvailable();
  const key = await deriveKey(secret, ["decrypt"]);
  const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv: own(fromBase64(ivB64)), additionalData: aad(from, to) }, key, own(fromBase64(bodyB64)));
  return new TextDecoder().decode(opened);
}
