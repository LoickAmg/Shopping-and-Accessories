import type { Metadata } from "next";
import Link from "next/link";

import { ROLE_LABELS, can } from "@/lib/roles";
import { requireStaff } from "@/server/guard";

export const metadata: Metadata = { title: { default: "Administration", template: "%s — Administration" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();

  return (
    <>
      <nav className="admin-nav" aria-label="Administration">
        <Link href="/admin">Tableau de bord</Link>
        <Link href="/admin/produits">Produits</Link>
        <Link href="/admin/stock">Stock</Link>
        <Link href="/admin/categories">Rayons</Link>
        <Link href="/admin/commandes">Commandes</Link>
        {can(user.role, "devises") && <Link href="/admin/devises">Devises</Link>}
        {can(user.role, "utilisateurs") && <Link href="/admin/utilisateurs">Équipe et comptes</Link>}
        {can(user.role, "journal") && <Link href="/admin/journal">Journal</Link>}
        <span className="admin-role muted small">
          {user.name || user.email} · {ROLE_LABELS[user.role]}
        </span>
      </nav>
      {children}
    </>
  );
}
