import { notFound, redirect } from "next/navigation";

import type { User } from "@/db/schema";
import { can, isStaff } from "@/lib/roles";
import type { Permission } from "@/lib/roles";

import { getCurrentUser } from "./context";

/**
 * Réserve une page ou une action à l'équipe (gestionnaire ou administrateur).
 * À appeler au début de chaque page et de chaque action serveur du back-office :
 * masquer un lien ne protège rien, car une action peut être appelée directement.
 */
export async function requireStaff(permission?: Permission): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/compte/connexion?retour=/admin");
  if (!isStaff(user.role)) notFound();
  if (permission && !can(user.role, permission)) redirect("/admin?interdit=1");
  return user;
}

/** Réserve une page ou une action à l'administrateur (argent, devises, comptes, journal). */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/compte/connexion?retour=/admin");
  if (!isStaff(user.role)) notFound();
  if (user.role !== "admin") redirect("/admin?interdit=1");
  return user;
}
