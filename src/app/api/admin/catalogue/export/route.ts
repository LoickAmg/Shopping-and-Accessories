import { getDb } from "@/db/client";
import { can } from "@/lib/roles";
import { getCurrentUser } from "@/server/context";
import { buildProductWorkbook } from "@/server/product-sheet";

export const dynamic = "force-dynamic";

/** Export du catalogue (.xlsx) : mêmes filtres que la liste des produits de l'administration. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "catalogue")) return new Response("Accès réservé à l'équipe.", { status: 403 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 80) || undefined;
  const rayon = url.searchParams.get("rayon") ?? "";
  const statut = url.searchParams.get("statut") ?? "";
  const stock = url.searchParams.get("stock") ?? "";

  const db = await getDb();
  const bytes = await buildProductWorkbook(db, {
    q,
    categoryId: rayon === "aucun" ? "aucun" : Number(rayon) > 0 ? Number(rayon) : undefined,
    status: statut === "en-vente" || statut === "archives" ? statut : undefined,
    stock: stock === "rupture" || stock === "bas" ? stock : undefined,
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="catalogue-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
