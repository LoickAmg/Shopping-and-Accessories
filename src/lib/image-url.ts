/**
 * Adresse d'image acceptée dans le back-office : une image du site
 * (« /assets/sac.jpeg », servie depuis `public/`) ou une image distante en
 * HTTPS. Tout le reste est refusé : `http://` (contenu mixte), `//hote`
 * (adresse externe déguisée), `javascript:`, `data:`, espaces et caractères
 * de contrôle.
 */
export function isAllowedImageUrl(value: string): boolean {
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^https:\/\/[^/]+/i.test(value)) return true;
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}
