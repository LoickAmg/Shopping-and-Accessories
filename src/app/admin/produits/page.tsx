import type { Metadata } from "next";
import Link from "next/link";

import { toggleProductAction } from "@/app/actions/admin";
import { getDb } from "@/db/client";
import { money } from "@/lib/format";
import { listProductsForAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Produits" };

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/produits">) {
  const query = await searchParams;
  const rows = await listProductsForAdmin(await getDb());

  return (
    <>
      <div className="page-head">
        <h1>Produits</h1>
        <Link href="/admin/produits/nouveau" className="button">
          Nouveau produit
        </Link>
      </div>

      {query.enregistre && (
        <p className="notice notice-ok" role="status">
          Produit enregistré.
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Produit</th>
              <th scope="col">Rayon</th>
              <th scope="col" className="num">
                Prix
              </th>
              <th scope="col" className="num">
                Stock
              </th>
              <th scope="col">Statut</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product, categoryName }) => (
              <tr key={product.id}>
                <td>
                  <Link href={`/admin/produits/${product.id}`}>{product.name}</Link>
                </td>
                <td>{categoryName ?? "—"}</td>
                <td className="num">{money(product.priceCents)}</td>
                <td className="num">{product.stock}</td>
                <td>{product.active ? "En vente" : "Archivé"}</td>
                <td>
                  <form action={toggleProductAction}>
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="active" value={product.active ? "0" : "1"} />
                    <button type="submit" className="link-button">
                      {product.active ? "Archiver" : "Remettre en vente"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
