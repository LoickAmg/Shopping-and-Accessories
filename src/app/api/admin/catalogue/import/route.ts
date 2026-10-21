import { getDb } from "@/db/client";
import { can } from "@/lib/roles";
import { logAction } from "@/server/audit";
import { getCurrentUser } from "@/server/context";
import { hitRateLimit } from "@/server/rate-limit";
import { importProductSheet } from "@/server/product-sheet";
import { fingerprintOf } from "@/server/request";
import { SpreadsheetError } from "@/server/spreadsheet";

export const dynamic = "force-dynamic";

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

/**
 * Import du catalogue depuis un classeur .xlsx (ou .csv) : d'abord un aperçu
 * (`?apercu=1`, rien n'est enregistré), puis l'import réel une fois confirmé.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ error: "Origine refusée." }, { status: 403 });

  const user = await getCurrentUser();
  if (!user || !can(user.role, "catalogue")) return Response.json({ error: "Accès réservé à l'équipe." }, { status: 403 });

  const db = await getDb();
  const limit = await hitRateLimit(db, `import:${fingerprintOf(user.id)}`, { max: 20, windowSeconds: 60 * 60 });
  if (!limit.allowed) return Response.json({ error: "Trop d'imports : réessayez dans un moment." }, { status: 429 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMPORT_BYTES + 64 * 1024) return Response.json({ error: "Fichier trop volumineux (8 Mo au maximum)." }, { status: 413 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("fichier");
  } catch {
    return Response.json({ error: "Envoi illisible." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_IMPORT_BYTES) return Response.json({ error: "Fichier trop volumineux (8 Mo au maximum)." }, { status: 413 });

  const dryRun = new URL(request.url).searchParams.get("apercu") === "1";
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const summary = await importProductSheet(db, bytes, user.id, { dryRun });
    if (!dryRun && summary.created + summary.updated > 0) {
      await logAction(
        db,
        user,
        "catalogue.import",
        { type: "catalogue", id: file.name },
        `${file.name} : ${summary.created} créé(s), ${summary.updated} modifié(s)${summary.errors.length ? `, ${summary.errors.length} ligne(s) en erreur` : ""}`,
      );
    }
    return Response.json(summary);
  } catch (error) {
    if (error instanceof SpreadsheetError) return Response.json({ error: error.message }, { status: 415 });
    console.error("Import du catalogue en échec :", error);
    return Response.json({ error: error instanceof Error ? error.message : "L'import a échoué." }, { status: 500 });
  }
}
