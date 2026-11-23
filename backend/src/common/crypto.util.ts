/**
 * Outils cryptographiques de la bibliothèque standard Node.js.
 *
 * - Mots de passe : scrypt avec sel aléatoire, comparaison en temps constant.
 * - Jetons de session : 32 octets aléatoires.
 * - Empreinte de clé : SHA3-256 de ek, tronquée à 16 caractères hexadécimaux.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Retourne le hachage sous la forme `scrypt$<sel hex>$<clé hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/** Vérifie un mot de passe contre un hachage produit par `hashPassword`. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, saltHex, keyHex] = stored.split('$');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Jeton de session opaque (base64url, 32 octets). */
export const randomToken = (): string => randomBytes(32).toString('base64url');

/** Empreinte d'une clé d'encapsulation : 16 caractères hexadécimaux. */
export function fingerprintOf(ek: Buffer): string {
  return createHash('sha3-256').update(ek).digest('hex').slice(0, 16);
}

/** Décode du base64 standard en refusant tout encodage non canonique. */
export function decodeBase64Strict(value: string): Buffer | null {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : null;
}
