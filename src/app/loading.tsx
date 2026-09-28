export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Chargement…</span>
      <div className="skeleton skeleton-title" aria-hidden="true" />
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton skeleton-tile" />
        ))}
      </div>
    </div>
  );
}
