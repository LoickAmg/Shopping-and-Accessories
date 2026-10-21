import type { Metadata } from "next";
import Link from "next/link";

import { setUserRoleAction, setUserSuspendedAction } from "@/app/actions/admin";
import { AdminPager, currentPath, pageParam, param } from "@/components/AdminPager";
import { getDb } from "@/db/client";
import { USER_ROLES } from "@/db/schema";
import type { UserRole } from "@/db/schema";
import { formatDay } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/roles";
import { requireAdmin } from "@/server/guard";
import { USERS_PAGE_SIZE, listUsers } from "@/server/users";

export const metadata: Metadata = { title: "Équipe et comptes" };

const ERRORS: Record<string, string> = {
  self: "Vous ne pouvez pas modifier votre propre compte : demandez à un autre administrateur.",
  last_admin: "C'est le dernier administrateur actif : nommez d'abord un autre administrateur.",
  not_found: "Compte introuvable.",
};

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/utilisateurs">) {
  const me = await requireAdmin();
  const query = await searchParams;
  const q = param(query.q).trim().slice(0, 80);
  const roleParam = param(query.role);
  const role = (USER_ROLES as readonly string[]).includes(roleParam) ? (roleParam as UserRole) : undefined;
  const page = pageParam(query.page);

  const { rows, total } = await listUsers(await getDb(), { q, role, page });
  const filters = { q, role: role ?? "" };
  const here = currentPath("/admin/utilisateurs", filters, page);
  const error = ERRORS[param(query.erreur)];

  return (
    <>
      <div className="page-head">
        <h1>Équipe et comptes</h1>
      </div>

      <section className="notice" aria-labelledby="how-to">
        <h2 id="how-to" className="small" style={{ margin: 0 }}>
          Donner accès au back-office
        </h2>
        <p className="small" style={{ margin: "0.4rem 0 0" }}>
          La personne crée d&apos;abord son compte sur le site (« Mon compte », puis « Créer un compte »), avec sa propre adresse et son propre mot de passe.
          Retrouvez-la ici et choisissez son rôle. <strong>Gestionnaire</strong> : produits, photos, stock, rayons et commandes.{" "}
          <strong>Administrateur</strong> : tout, y compris les encaissements, remboursements, devises, comptes et le journal.
        </p>
      </section>

      {param(query.enregistre) && (
        <p className="notice notice-ok" role="status">
          Compte mis à jour.
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <form className="admin-filters" role="search" action="/admin/utilisateurs">
        <div className="field admin-filters-search">
          <label htmlFor="q">Rechercher</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nom ou adresse e-mail" />
        </div>
        <div className="field">
          <label htmlFor="role">Rôle</label>
          <select id="role" name="role" defaultValue={role ?? ""}>
            <option value="">Tous</option>
            {USER_ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filters-actions">
          <button type="submit" className="button button-small">
            Filtrer
          </button>
          {(q || role) && (
            <Link href="/admin/utilisateurs" className="small">
              Effacer
            </Link>
          )}
        </div>
      </form>

      <p className="muted small" role="status">
        {total} compte{total > 1 ? "s" : ""}
      </p>

      {rows.length === 0 ? (
        <p className="empty">Aucun compte ne correspond.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Compte</th>
                <th scope="col">Inscription</th>
                <th scope="col" className="num">
                  Commandes
                </th>
                <th scope="col">Rôle</th>
                <th scope="col">Accès</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const self = user.id === me.id;
                return (
                  <tr key={user.id} className={user.suspendedAt ? "is-archived" : undefined}>
                    <td>
                      {user.name || <span className="muted">Sans nom</span>}
                      {self && <span className="muted small"> (vous)</span>}
                      <br />
                      <span className="muted small">{user.email}</span>
                    </td>
                    <td className="small">{formatDay(user.createdAt)}</td>
                    <td className="num">{user.orderCount}</td>
                    <td>
                      {self ? (
                        ROLE_LABELS[user.role]
                      ) : (
                        <form action={setUserRoleAction} className="inline-form">
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="retour" value={here} />
                          <label className="sr-only" htmlFor={`role-${user.id}`}>
                            Rôle de {user.email}
                          </label>
                          <select id={`role-${user.id}`} name="role" defaultValue={user.role}>
                            {USER_ROLES.map((value) => (
                              <option key={value} value={value}>
                                {ROLE_LABELS[value]}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="link-button">
                            Appliquer
                          </button>
                        </form>
                      )}
                    </td>
                    <td>
                      {user.suspendedAt ? <span className="status status-alert">Suspendu</span> : <span className="status status-paid">Actif</span>}
                      {!self && (
                        <form action={setUserSuspendedAction} className="inline-form">
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="suspend" value={user.suspendedAt ? "0" : "1"} />
                          <input type="hidden" name="retour" value={here} />
                          <button type="submit" className="link-button">
                            {user.suspendedAt ? "Réactiver" : "Suspendre"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager path="/admin/utilisateurs" params={filters} page={page} total={total} pageSize={USERS_PAGE_SIZE} />
    </>
  );
}
