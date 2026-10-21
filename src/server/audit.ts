import { count, desc, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { auditLog } from "@/db/schema";
import type { AuditEntry, User } from "@/db/schema";

export interface AuditTarget {
  type: string;
  id: string | number;
}

/** Inscrit une action du back-office au journal. */
export async function logAction(
  db: Db,
  actor: Pick<User, "id" | "email">,
  action: string,
  target: AuditTarget | null,
  summary: string,
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: actor.id,
    actorEmail: actor.email,
    action,
    targetType: target?.type ?? "",
    targetId: target ? String(target.id) : "",
    summary: summary.slice(0, 500),
  });
}

export const AUDIT_PAGE_SIZE = 50;

export async function listAudit(db: Db, options: { page?: number; actorId?: string } = {}): Promise<{ rows: AuditEntry[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const where = options.actorId ? eq(auditLog.actorId, options.actorId) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);
  return { rows, total };
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "product.create": "Produit créé",
  "product.update": "Produit modifié",
  "product.archive": "Produit archivé",
  "product.restore": "Produit remis en vente",
  "product.duplicate": "Produit dupliqué",
  "stock.adjust": "Stock corrigé",
  "category.create": "Rayon créé",
  "category.update": "Rayon modifié",
  "category.delete": "Rayon supprimé",
  "order.fulfill": "Commande expédiée",
  "order.cancel": "Commande annulée",
  "order.refund": "Remboursement soldé",
  "order.manual-pay": "Paiement encaissé à la main",
  "currency.update": "Devise modifiée",
  "user.role": "Rôle modifié",
  "user.suspend": "Compte suspendu",
  "user.reactivate": "Compte réactivé",
  "photo.upload": "Photo envoyée",
};
