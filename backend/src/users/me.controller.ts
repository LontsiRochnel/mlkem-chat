/**
 * Espace de l'utilisateur connecté : GET /me et PUT /me/public-key.
 * Seule la clé publique (ek) est acceptée. La clé privée ne quitte jamais le client.
 */
import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { AuthedRequest, AuthGuard } from "../auth/auth.guard";
import { decodeBase64Strict, fingerprintOf } from "../common/crypto.util";
import { EK_SIZES, isVariant, Variant } from "../common/mlkem";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { MemoryStore } from "../store/memory.store";

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly store: MemoryStore,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get()
  me(@Req() req: AuthedRequest) {
    const username = req.user!.username;
    return { username, hasPublicKey: this.store.publicKeys.has(username) };
  }

  /**
   * Corps : { variant, ek } (ek en base64 standard).
   * Remplace la clé précédente et prévient les clients connectés.
   */
  @Put("public-key")
  publishPublicKey(@Req() req: AuthedRequest, @Body() body: Record<string, unknown>) {
    const username = req.user!.username;
    const { variant, ek } = body;
    if (!isVariant(variant)) {
      throw new BadRequestException("variant doit valoir ML-KEM-512, ML-KEM-768 ou ML-KEM-1024");
    }
    if (typeof ek !== "string") {
      throw new BadRequestException("ek doit être une chaîne base64");
    }
    const bytes = decodeBase64Strict(ek);
    if (!bytes) {
      throw new BadRequestException("ek n'est pas du base64 valide");
    }
    if (bytes.length !== EK_SIZES[variant as Variant]) {
      throw new BadRequestException(`ek doit faire ${EK_SIZES[variant]} octets pour ${variant}`);
    }
    const record = {
      username,
      variant,
      ek,
      fingerprint: fingerprintOf(bytes),
      createdAt: new Date().toISOString(),
    };
    this.store.publicKeys.set(username, record);
    this.realtime.broadcastKeyUpdate(username);
    return { variant: record.variant, fingerprint: record.fingerprint, createdAt: record.createdAt };
  }
}
