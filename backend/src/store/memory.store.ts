/**
 * Stockage en mémoire du processus. Rien n'est persisté : à l'arrêt du serveur,
 * toutes les données sont perdues. C'est volontaire (démonstration pédagogique).
 */
import { Global, Injectable, Module } from '@nestjs/common';
import { Variant } from '../common/mlkem';

export interface UserRecord {
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface PublicKeyRecord {
  username: string;
  variant: Variant;
  ek: string; // base64
  fingerprint: string;
  createdAt: string;
}

export interface MessageRecord {
  id: string;
  from: string;
  to: string;
  kind: 'TEXT' | 'KEM_CIPHERTEXT';
  body: string; // texte, ou c en base64 pour KEM_CIPHERTEXT
  variant: Variant | null;
  ekFingerprint: string | null;
  createdAt: string;
}

export interface SessionRecord {
  username: string;
  expiresAt: number;
}

@Injectable()
export class MemoryStore {
  /** Comptes, indexés par nom d'utilisateur (en minuscules). */
  readonly users = new Map<string, UserRecord>();
  /** Dernière clé publique publiée par utilisateur. */
  readonly publicKeys = new Map<string, PublicKeyRecord>();
  /** Tous les messages, dans l'ordre d'arrivée. */
  readonly messages: MessageRecord[] = [];
  /** Sessions actives, indexées par jeton Bearer. */
  readonly sessions = new Map<string, SessionRecord>();
  /** Échecs de connexion récents, par nom d'utilisateur. */
  readonly failedLogins = new Map<string, { count: number; windowStart: number }>();
}

@Global()
@Module({ providers: [MemoryStore], exports: [MemoryStore] })
export class StoreModule {}
