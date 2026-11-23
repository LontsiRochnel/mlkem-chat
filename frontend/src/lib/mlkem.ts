/**
 * ML-KEM dans le navigateur, via @noble/post-quantum (FIPS 203).
 * Aucune donnée ne quitte le client : seules les clés publiques et les textes
 * encapsulés sont envoyés au serveur, par l'intermédiaire de l'interface.
 */
import { ml_kem512, ml_kem768, ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { sha3_256 } from '@noble/hashes/sha3';
import { toHex } from './base64';

export type Variant = 'ML-KEM-512' | 'ML-KEM-768' | 'ML-KEM-1024';
export const VARIANTS: Variant[] = ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'];

const IMPL = {
  'ML-KEM-512': ml_kem512,
  'ML-KEM-768': ml_kem768,
  'ML-KEM-1024': ml_kem1024,
} as const;

/** Tailles en octets (FIPS 203) : clé publique ek et texte encapsulé c. */
export const EK_SIZES: Record<Variant, number> = { 'ML-KEM-512': 800, 'ML-KEM-768': 1184, 'ML-KEM-1024': 1568 };
export const CT_SIZES: Record<Variant, number> = { 'ML-KEM-512': 768, 'ML-KEM-768': 1088, 'ML-KEM-1024': 1568 };

/** Déduit la variante à partir de la taille d'une clé publique. */
export function variantFromEkLength(length: number): Variant | null {
  return VARIANTS.find((v) => EK_SIZES[v] === length) ?? null;
}

export interface KeyPair {
  variant: Variant;
  ek: Uint8Array;
  dk: Uint8Array;
}

export function keygen(variant: Variant): KeyPair {
  const { publicKey, secretKey } = IMPL[variant].keygen();
  return { variant, ek: publicKey, dk: secretKey };
}

export function encaps(ek: Uint8Array, variant: Variant): { K: Uint8Array; c: Uint8Array } {
  const { cipherText, sharedSecret } = IMPL[variant].encapsulate(ek);
  return { K: sharedSecret, c: cipherText };
}

export function decaps(dk: Uint8Array, c: Uint8Array, variant: Variant): Uint8Array {
  return IMPL[variant].decapsulate(c, dk);
}

/** Empreinte d'une clé publique : 16 caractères hexadécimaux, comme le backend. */
export const fingerprint = (ek: Uint8Array): string => toHex(sha3_256(ek)).slice(0, 16);
