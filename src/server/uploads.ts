import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Taille maximale d'une photo reçue (le navigateur la réduit avant l'envoi). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageType = keyof typeof IMAGE_TYPES;

/**
 * Type réel d'une image, lu dans ses premiers octets : le nom du fichier et le
 * type annoncé par le navigateur ne prouvent rien.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export class UploadUnavailableError extends Error {
  constructor() {
    super("Le stockage des photos n'est pas configuré (BLOB_READ_WRITE_TOKEN manquant).");
    this.name = "UploadUnavailableError";
  }
}

/** Vrai si les photos peuvent être enregistrées dans cet environnement. */
export function uploadsAvailable(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()) || process.env.NODE_ENV !== "production";
}

/**
 * Enregistre une photo de produit et renvoie son adresse publique. En ligne,
 * elle part sur Vercel Blob ; en développement, sans jeton, elle est écrite dans
 * `public/uploads/` (ignoré par git) pour pouvoir tout essayer en local.
 */
export async function storeProductImage(bytes: Uint8Array, type: ImageType): Promise<string> {
  const name = `${randomUUID()}.${IMAGE_TYPES[type]}`;
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`produits/${name}`, Buffer.from(bytes), {
      access: "public",
      contentType: type,
      token,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return blob.url;
  }
  if (process.env.NODE_ENV === "production") throw new UploadUnavailableError();
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${name}`;
}
