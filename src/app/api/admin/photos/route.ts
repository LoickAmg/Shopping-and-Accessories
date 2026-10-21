import { getDb } from "@/db/client";
import { can } from "@/lib/roles";
import { getCurrentUser } from "@/server/context";
import { hitRateLimit } from "@/server/rate-limit";
import { fingerprintOf } from "@/server/request";
import { MAX_UPLOAD_BYTES, UploadUnavailableError, detectImageType, storeProductImage } from "@/server/uploads";

export const dynamic = "force-dynamic";

/**
 * Envoi d'une photo de produit depuis le back-office. Le navigateur réduit la
 * photo avant l'envoi ; ici on vérifie le rôle, l'origine de la requête, la
 * taille et le type réel du fichier (ses premiers octets), puis on la stocke.
 */
export async function POST(request: Request) {
  // Une requête venue d'un autre site (formulaire piégé) est refusée : le cookie de session ne suffit pas.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user || !can(user.role, "catalogue")) return Response.json({ error: "Accès réservé à l'équipe." }, { status: 403 });

  const db = await getDb();
  const limit = await hitRateLimit(db, `upload:${fingerprintOf(user.id)}`, { max: 120, windowSeconds: 60 * 60 });
  if (!limit.allowed) return Response.json({ error: "Trop de photos envoyées : réessayez dans un moment." }, { status: 429 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return Response.json({ error: "Photo trop lourde (4 Mo au maximum)." }, { status: 413 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("photo");
  } catch {
    return Response.json({ error: "Envoi illisible." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Aucune photo reçue." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Photo trop lourde (4 Mo au maximum)." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return Response.json({ error: "Format non pris en charge : JPEG, PNG ou WebP." }, { status: 415 });

  try {
    const url = await storeProductImage(bytes, type);
    return Response.json({ url });
  } catch (error) {
    if (error instanceof UploadUnavailableError) return Response.json({ error: error.message }, { status: 503 });
    console.error("Envoi de photo en échec :", error);
    return Response.json({ error: "La photo n'a pas pu être enregistrée." }, { status: 500 });
  }
}
