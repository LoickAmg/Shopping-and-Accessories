import Link from "next/link";

/** Pagination des listes du back-office : garde les filtres de la page dans les liens. */
export function AdminPager({
  path,
  params,
  page,
  total,
  pageSize,
}: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    if (target > 1) search.set("page", String(target));
    const suffix = search.toString();
    return suffix ? `${path}?${suffix}` : path;
  };
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? <Link href={href(page - 1)}>← Précédent</Link> : <span />}
      <span>
        Page {page} sur {pageCount}
      </span>
      {page < pageCount ? <Link href={href(page + 1)}>Suivant →</Link> : <span />}
    </nav>
  );
}

/** Lit un paramètre d'adresse simple (le premier s'il est répété). */
export function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function pageParam(value: string | string[] | undefined): number {
  const page = Number.parseInt(param(value), 10);
  return Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1;
}

/** Adresse de la page courante avec ses filtres, pour y revenir après une action. */
export function currentPath(path: string, params: Record<string, string | undefined>, page = 1): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  if (page > 1) search.set("page", String(page));
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}
