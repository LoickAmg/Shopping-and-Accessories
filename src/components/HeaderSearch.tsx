export function HeaderSearch() {
  return (
    <form action="/boutique" method="get" role="search" className="search-form">
      <label htmlFor="header-search" className="sr-only">
        Rechercher un produit
      </label>
      <input id="header-search" type="search" name="q" placeholder="Rechercher" autoComplete="off" />
    </form>
  );
}
