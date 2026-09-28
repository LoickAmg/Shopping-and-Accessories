"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Rail horizontal aimanté : flèches précédent / suivant, barre de progression,
 * glisser à la souris (le tactile défile nativement). Le contenu est rendu par
 * le serveur et passé en enfants.
 */
export function Rail({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const max = track.scrollWidth - track.clientWidth;
      setEdges({ start: track.scrollLeft <= 4, end: track.scrollLeft >= max - 4 });
      setProgress(max > 0 ? track.scrollLeft / max : 1);
    };
    measure();

    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button, input, select")) return;
      down = true;
      moved = false;
      startX = event.clientX;
      startLeft = track.scrollLeft;
    };
    const onMove = (event: PointerEvent) => {
      if (!down) return;
      const dx = event.clientX - startX;
      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        track.dataset.dragging = "true";
      }
      if (moved) track.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      delete track.dataset.dragging;
    };
    // Un glisser ne doit pas ouvrir la fiche sous le curseur.
    const onClick = (event: MouseEvent) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }
    };

    track.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    track.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    track.addEventListener("click", onClick, true);
    return () => {
      track.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      track.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      track.removeEventListener("click", onClick, true);
    };
  }, []);

  const step = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const item = track.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const width = item ? item.offsetWidth + gap : track.clientWidth * 0.8;
    const perView = Math.max(1, Math.floor((track.clientWidth + gap) / width));
    track.scrollBy({ left: direction * width * perView, behavior: "smooth" });
  };

  return (
    <div className={`hrail ${className ?? ""}`}>
      <div className="hrail-controls">
        <div className="hrail-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(progress, 0.08)})` }} />
        </div>
        <button type="button" className="hrail-arrow" onClick={() => step(-1)} disabled={edges.start} aria-label={`${label} : précédent`}>
          <span aria-hidden="true">←</span>
        </button>
        <button type="button" className="hrail-arrow" onClick={() => step(1)} disabled={edges.end} aria-label={`${label} : suivant`}>
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <ul className="hrail-track" ref={trackRef} aria-label={label}>
        {children}
      </ul>
    </div>
  );
}
