import type { Metadata } from "next";
import Link from "next/link";

import { AdminPager, pageParam, param } from "@/components/AdminPager";
import { getDb } from "@/db/client";
import { formatDate } from "@/lib/format";
import { AUDIT_ACTION_LABELS, AUDIT_PAGE_SIZE, listAudit } from "@/server/audit";
import { requireAdmin } from "@/server/guard";

export const metadata: Metadata = { title: "Journal d'activité" };

/** Lien vers l'objet concerné par une ligne du journal, quand il existe encore une page pour lui. */
function targetHref(type: string, id: string): string | null {
  if (type === "product" && /^\d+$/.test(id)) return `/admin/produits/${id}`;
  if (type === "order" && /^[0-9a-f-]{36}$/i.test(id)) return `/admin/commandes/${id}`;
  return null;
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/journal">) {
  await requireAdmin();
  const query = await searchParams;
  const page = pageParam(query.page);
  const auteur = param(query.auteur);
  const actorId = /^[0-9a-f-]{36}$/i.test(auteur) ? auteur : undefined;
  const { rows, total } = await listAudit(await getDb(), { page, actorId });

  return (
    <>
      <div className="page-head">
        <h1>Journal d&apos;activité</h1>
        <p className="muted small">Qui a fait quoi dans le back-office, et quand.</p>
      </div>

      {actorId && (
        <p className="small">
          Actions d&apos;un seul membre de l&apos;équipe. <Link href="/admin/journal">Tout afficher</Link>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="empty">Rien n&apos;est encore inscrit au journal.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Par</th>
                <th scope="col">Action</th>
                <th scope="col">Détail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const href = targetHref(entry.targetType, entry.targetId);
                return (
                  <tr key={entry.id}>
                    <td className="small">{formatDate(entry.createdAt)}</td>
                    <td className="small">
                      {entry.actorId ? <Link href={`/admin/journal?auteur=${entry.actorId}`}>{entry.actorEmail}</Link> : entry.actorEmail}
                    </td>
                    <td>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</td>
                    <td>{href ? <Link href={href}>{entry.summary}</Link> : entry.summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager path="/admin/journal" params={{ auteur: actorId }} page={page} total={total} pageSize={AUDIT_PAGE_SIZE} />
    </>
  );
}
