/**
 * Affichage des noms d'utilisateur : première lettre en majuscule.
 * Ne sert qu'à l'affichage : l'identifiant reste en minuscules et insensible à la casse.
 */
export function displayName(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
