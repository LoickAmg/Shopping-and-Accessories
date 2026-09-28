import { notFound, redirect } from "next/navigation";

import type { User } from "@/db/schema";

import { getCurrentUser } from "./context";

/**
 * Réserve une page ou une action à l'administrateur. À appeler au début de
 * chaque action serveur du back-office : masquer un lien ne protège rien, car
 * une action peut être appelée directement.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/compte/connexion?retour=/admin");
  if (user.role !== "admin") notFound();
  return user;
}
