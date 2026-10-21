import type { UserRole } from "@/db/schema";

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Client",
  manager: "Gestionnaire",
  admin: "Administrateur",
};

/**
 * Ce que chaque rôle peut faire dans le back-office. Le gestionnaire tient la
 * boutique au quotidien ; l'administrateur garde l'argent (encaissements,
 * remboursements, devises), les comptes et le journal.
 */
export const PERMISSIONS = {
  catalogue: ["manager", "admin"],
  commandes: ["manager", "admin"],
  paiements: ["admin"],
  devises: ["admin"],
  utilisateurs: ["admin"],
  journal: ["admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | undefined | null, permission: Permission): boolean {
  return role != null && (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

/** Membre de l'équipe : accès au back-office. */
export function isStaff(role: UserRole | undefined | null): boolean {
  return role === "manager" || role === "admin";
}
