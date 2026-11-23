/**
 * Garde d'authentification : exige un en-tête `Authorization: Bearer <jeton>`
 * correspondant à une session valide. Renseigne `req.user` en cas de succès.
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { MemoryStore } from '../store/memory.store';

export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { username: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly store: MemoryStore) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    const match = /^Bearer\s+(\S+)$/.exec(value ?? '');
    if (!match) {
      throw new UnauthorizedException('Jeton manquant');
    }
    const session = this.store.sessions.get(match[1]);
    if (!session || session.expiresAt < Date.now()) {
      throw new UnauthorizedException('Session invalide ou expirée');
    }
    req.user = { username: session.username };
    return true;
  }
}
