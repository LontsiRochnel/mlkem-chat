/**
 * Consultation des utilisateurs : GET /users/:username et GET /users/:username/public-key.
 */
import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MemoryStore } from '../store/memory.store';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly store: MemoryStore) {}

  @Get(':username')
  getUser(@Param('username') rawUsername: string) {
    const username = rawUsername.toLowerCase();
    const user = this.store.users.get(username);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: `Utilisateur « ${username} » introuvable.` });
    }
    return { username: user.username, hasPublicKey: this.store.publicKeys.has(username) };
  }

  @Get(':username/public-key')
  getPublicKey(@Param('username') rawUsername: string) {
    const username = rawUsername.toLowerCase();
    const key = this.store.publicKeys.get(username);
    if (!key) {
      throw new NotFoundException({ code: 'NO_PUBLIC_KEY', message: `« ${username} » n'a publié aucune clé publique.` });
    }
    return { variant: key.variant, ek: key.ek, fingerprint: key.fingerprint, createdAt: key.createdAt };
  }
}
