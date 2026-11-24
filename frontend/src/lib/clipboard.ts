/**
 * Copie dans le presse-papiers, compatible Safari.
 * Safari n'accepte la copie que dans le geste de l'utilisateur : l'appel doit donc
 * partir immédiatement, sans attente réseau avant.
 */

/** Copie un texte déjà connu. À appeler directement depuis le clic. */
export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  return legacyCopy(text);
}

/**
 * Copie une valeur qu'il faut d'abord récupérer sur le serveur.
 * Utilise un ClipboardItem dont le contenu est une promesse, ce qui garde le geste utilisateur.
 */
export function copyLater(fetchValue: () => Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const item = new ClipboardItem({
      "text/plain": fetchValue().then((value) => new Blob([value], { type: "text/plain" })),
    });
    return navigator.clipboard.write([item]);
  }
  return fetchValue().then(copyText);
}

/** Méthode historique : sélection d'un champ caché puis commande « copier ». */
function legacyCopy(text: string): Promise<void> {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  return ok ? Promise.resolve() : Promise.reject(new Error("Copie impossible dans ce navigateur."));
}
