/**
 * Client HTTP vers l'API du backend (même origine). Le jeton Bearer est conservé
 * dans sessionStorage, pour la durée de l'onglet.
 */
import type { Variant } from './mlkem';

export interface Session {
  token: string;
  username: string;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  kind: 'TEXT' | 'KEM_CIPHERTEXT';
  body: string;
  variant: Variant | null;
  ekFingerprint: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  username: string;
  lastMessageAt: string;
  lastMessageKind: Message['kind'];
}

export interface PublicKeyInfo {
  variant: Variant;
  ek: string;
  fingerprint: string;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

const SESSION_KEY = 'mlkem.session';

export const getSession = (): Session | null => {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
};
export const setSession = (token: string, username: string): void =>
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, username }));
export const clearSession = (): void => sessionStorage.removeItem(SESSION_KEY);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getSession()?.token;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const obj = (data ?? {}) as { code?: string; message?: string | string[] };
    const message = Array.isArray(obj.message)
      ? obj.message.join(', ')
      : obj.message ?? `Erreur ${res.status}`;
    throw new ApiError(res.status, obj.code, message);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  login: (username: string, password: string, createIfMissing: boolean) =>
    request<{ token: string; username: string; created: boolean }>('POST', '/auth/login', {
      username,
      password,
      createIfMissing,
    }),
  me: () => request<{ username: string; hasPublicKey: boolean }>('GET', '/me'),
  publishKey: (variant: Variant, ek: string) =>
    request<{ variant: Variant; fingerprint: string; createdAt: string }>('PUT', '/me/public-key', { variant, ek }),
  getUser: (username: string) => request<{ username: string; hasPublicKey: boolean }>('GET', `/users/${enc(username)}`),
  publicKey: (username: string) => request<PublicKeyInfo>('GET', `/users/${enc(username)}/public-key`),
  conversations: () => request<ConversationSummary[]>('GET', '/conversations'),
  thread: (username: string) => request<Message[]>('GET', `/conversations/${enc(username)}/messages`),
  send: (payload: {
    to: string;
    kind: Message['kind'];
    body: string;
    variant?: Variant;
    ekFingerprint?: string;
  }) => request<Message>('POST', '/messages', payload),
};
