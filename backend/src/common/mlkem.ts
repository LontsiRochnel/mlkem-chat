/**
 * Constantes ML-KEM partagées par le backend.
 *
 * Tailles en octets selon FIPS 203 : clé d'encapsulation (ek) et texte encapsulé (c).
 * Le serveur ne fait aucun calcul ML-KEM : il ne vérifie que les tailles.
 */
export type Variant = 'ML-KEM-512' | 'ML-KEM-768' | 'ML-KEM-1024';

export const VARIANTS: Variant[] = ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'];

export const EK_SIZES: Record<Variant, number> = {
  'ML-KEM-512': 800,
  'ML-KEM-768': 1184,
  'ML-KEM-1024': 1568,
};

export const CT_SIZES: Record<Variant, number> = {
  'ML-KEM-512': 768,
  'ML-KEM-768': 1088,
  'ML-KEM-1024': 1568,
};

export const isVariant = (value: unknown): value is Variant =>
  typeof value === 'string' && (VARIANTS as string[]).includes(value);
