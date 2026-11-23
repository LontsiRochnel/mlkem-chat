/** Route de connexion : POST /auth/login. */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Corps : { username, password, createIfMissing? }.
   * Réponse : { token, username, created }.
   */
  @Post('login')
  @HttpCode(200)
  login(@Body() body: Record<string, unknown>) {
    return this.auth.login(body.username, body.password, body.createIfMissing === true);
  }
}
