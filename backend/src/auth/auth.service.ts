/**
 * Authentification : création de compte sur confirmation explicite, connexion,
 * jetons Bearer et limitation des échecs de connexion.
 */
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MemoryStore } from '../store/memory.store';
import { hashPassword, randomToken, verifyPassword } from '../common/crypto.util';

const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;
const MAX_FAILED_LOGINS = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export interface LoginResult {
  token: string;
  username: string;
  created: boolean;
}

@Injectable()
export class AuthService {
  constructor(private readonly store: MemoryStore) {}

  /**
   * Connecte un utilisateur. Si le compte n'existe pas et que `createIfMissing`
   * est faux, renvoie 409 `USER_NOT_FOUND` : le client doit alors demander
   * confirmation puis renvoyer la requête avec `createIfMissing: true`.
   */
  async login(rawUsername: unknown, rawPassword: unknown, createIfMissing: boolean): Promise<LoginResult> {
    if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
      throw new BadRequestException('username et password sont requis (chaînes)');
    }
    const username = rawUsername.trim().toLowerCase();
    this.assertNotLocked(username);

    const existing = this.store.users.get(username);
    if (!existing) {
      if (!createIfMissing) {
        throw new ConflictException({
          code: 'USER_NOT_FOUND',
          message: `Le compte « ${username} » n'existe pas. Confirmez sa création.`,
        });
      }
      if (!USERNAME_RE.test(username)) {
        throw new BadRequestException('Nom invalide : 3 à 32 caractères parmi a-z, 0-9, _ . -');
      }
      if (rawPassword.length < 8) {
        throw new BadRequestException('Mot de passe trop court (8 caractères minimum)');
      }
      this.store.users.set(username, {
        username,
        passwordHash: await hashPassword(rawPassword),
        createdAt: new Date().toISOString(),
      });
      return { token: this.issueToken(username), username, created: true };
    }

    const valid = await verifyPassword(rawPassword, existing.passwordHash);
    if (!valid) {
      this.recordFailure(username);
      throw new UnauthorizedException('Identifiants incorrects');
    }
    this.store.failedLogins.delete(username);
    return { token: this.issueToken(username), username, created: false };
  }

  private issueToken(username: string): string {
    const token = randomToken();
    this.store.sessions.set(token, { username, expiresAt: Date.now() + SESSION_DURATION_MS });
    return token;
  }

  private assertNotLocked(username: string): void {
    const entry = this.store.failedLogins.get(username);
    if (!entry) return;
    if (Date.now() - entry.windowStart > FAILURE_WINDOW_MS) {
      this.store.failedLogins.delete(username);
      return;
    }
    if (entry.count >= MAX_FAILED_LOGINS) {
      throw new HttpException(
        { code: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Réessayez dans quelques minutes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(username: string): void {
    const now = Date.now();
    const entry = this.store.failedLogins.get(username);
    if (!entry || now - entry.windowStart > FAILURE_WINDOW_MS) {
      this.store.failedLogins.set(username, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
  }
}
