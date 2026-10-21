import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { duplicateProductAction } from "@/app/actions/admin";
import { ProductForm } from "@/components/ProductForm";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { minorToInput } from "@/lib/money";
import { getProductForAdmin } from "@/server/admin";
import { listCategories } from "@/server/catalog";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/server/guard";
import { STOCK_REASON_LABELS, listMovements } from "@/server/stock";

export const metadata: Metadata = { title: "Modifier le produit" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/produits/[id]">) {
  await requireStaff();
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  const db = await getDb();
  const [product, categories, movements, query] = await Promise.all([
    getProductForAdmin(db, productId),
    listCategories(db),
    listMovements(db, { productId, limit: 15 }),
    searchParams,
  ]);
  if (!product) notFound();
  const exponent = store.currency.exponent;

  return (
    <>
      <div className="page-head">
        <h1>{product.name}</h1>
        <div className="actions">
          {product.active && (
            <Link href={`/produit/${product.slug}`} className="small" target="_blank">
              Voir dans la boutique ↗
            </Link>
          )}
          <form action={duplicateProductAction}>
            <input type="hidden" name="id" value={product.id} />
            <button type="submit" className="button button-quiet button-small">
              Dupliquer
            </button>
          </form>
        </div>
      </div>
      {query.copie && (
        <p className="notice notice-ok" role="status">
          Copie créée, hors vente et avec un stock à zéro : ajustez le nom, les photos et les quantités, puis cochez « En vente ».
        </p>
      )}
      <div className="form-narrow" style={{ maxWidth: "40rem" }}>
        <ProductForm
          categories={categories.map((category) => ({ id: category.id, name: category.name, family: category.family }))}
          currencyCode={store.currency.code}
          exponent={exponent}
          initial={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            summary: product.summary,
            description: product.description,
            categoryId: product.categoryId == null ? "" : String(product.categoryId),
            price: minorToInput(product.priceCents, exponent),
            compareAt: product.compareAtCents == null ? "" : minorToInput(product.compareAtCents, exponent),
            active: product.active,
            department: product.department,
            condition: product.condition,
            wearGrade: product.wearGrade ?? "",
            defects: product.defects,
            material: product.material,
            tone: product.tone,
            imageUrl: product.imageUrl ?? "",
            gallery: product.gallery.join("\n"),
            sku: product.sku ?? "",
            variants: product.variants.map((variant) => ({
              id: variant.id,
              original: String(variant.stock),
              size: variant.size,
              color: variant.color,
              stock: String(variant.stock),
              sku: variant.sku ?? "",
            })),
          }}
        />
      </div>

      <section style={{ marginTop: "var(--space-7)" }} aria-labelledby="movements">
        <h2 id="movements">Mouvements de stock</h2>
        {movements.length === 0 ? (
          <p className="muted">Aucun mouvement enregistré pour ce produit.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Déclinaison</th>
                  <th scope="col">Motif</th>
                  <th scope="col" className="num">
                    Mouvement
                  </th>
                  <th scope="col" className="num">
                    Après
                  </th>
                  <th scope="col">Par</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="small">{formatDate(movement.createdAt)}</td>
                    <td>{movement.label || "Taille unique"}</td>
                    <td>
                      {movement.orderId ? <Link href={`/admin/commandes/${movement.orderId}`}>{STOCK_REASON_LABELS[movement.reason]}</Link> : STOCK_REASON_LABELS[movement.reason]}
                    </td>
                    <td className={`num ${movement.delta > 0 ? "delta-up" : "delta-down"}`}>
                      {movement.delta > 0 ? "+" : ""}
                      {movement.delta}
                    </td>
                    <td className="num">{movement.stockAfter ?? "—"}</td>
                    <td className="small muted">{movement.actorEmail ?? (movement.reason === "ajustement" ? "—" : "Boutique")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
