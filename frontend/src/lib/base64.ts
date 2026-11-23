/** Conversions octets <-> base64 standard et hexadécimal. */
export const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

/** Décode du base64 ; lève une erreur explicite si la chaîne est invalide. */
export const fromBase64 = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('Valeur invalide : base64 attendu.');
  }
  return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
};

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
