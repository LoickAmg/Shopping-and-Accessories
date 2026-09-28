import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/server/guard";

export const metadata: Metadata = { title: { default: "Administration", template: "%s — Administration" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <>
      <nav className="admin-nav" aria-label="Administration">
        <Link href="/admin">Tableau de bord</Link>
        <Link href="/admin/produits">Produits</Link>
        <Link href="/admin/categories">Rayons</Link>
        <Link href="/admin/commandes">Commandes</Link>
        <Link href="/admin/devises">Devises</Link>
      </nav>
      {children}
    </>
  );
}
