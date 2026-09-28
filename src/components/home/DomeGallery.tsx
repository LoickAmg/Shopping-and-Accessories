"use client";

import { useEffect, useRef } from "react";

/**
 * Fond d'accueil : une grille de photos posée à l'intérieur d'une sphère, vue
 * depuis son centre. La projection plate grossit les vignettes vers les bords,
 * d'où l'effet de dôme. La grille se replie sur elle-même (défilement infini),
 * dérive lentement, suit le pointeur et se tire à la souris ou au doigt.
 */

const COLS = 12;
const ROWS = 7;
/** Écart angulaire entre deux colonnes / deux rangées, en degrés. */
const STEP_X = 17;
const STEP_Y = 22;
const SPAN_X = COLS * STEP_X;
const SPAN_Y = ROWS * STEP_Y;

function wrap(value: number, span: number): number {
  return ((((value + span / 2) % span) + span) % span) - span / 2;
}

export function DomeGallery({ images }: { images: string[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tiles = tileRefs.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let radius = 1000;
    const resize = () => {
      radius = Math.max(window.innerWidth, window.innerHeight) * 0.62;
      root.style.setProperty("--dome-r", `${radius}px`);
    };
    resize();
    window.addEventListener("resize", resize);

    // Orientation : base (dérive + glisser) et regard (pointeur), lissées.
    let yaw = 0;
    let pitch = 0;
    let lookX = 0;
    let lookY = 0;
    let targetLookX = 0;
    let targetLookY = 0;
    let velocityX = reduced ? 0 : 0.02;
    let velocityY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let frame = 0;
    let lastTime = performance.now();

    const render = () => {
      const cy = yaw + lookX;
      const cp = pitch + lookY;
      for (let index = 0; index < tiles.length; index++) {
        const tile = tiles[index];
        if (!tile) continue;
        const col = index % COLS;
        const row = Math.floor(index / COLS);
        // Rangées décalées d'une demi-colonne : un appareil plus « tissé ».
        const az = wrap((col - (COLS - 1) / 2) * STEP_X + (row % 2) * (STEP_X / 2) + cy, SPAN_X);
        const el = wrap((row - (ROWS - 1) / 2) * STEP_Y + cp, SPAN_Y);
        const visible = Math.abs(az) < 84 && Math.abs(el) < 78;
        tile.style.visibility = visible ? "visible" : "hidden";
        if (visible) {
          tile.style.transform = `translateZ(${radius}px) rotateY(${az.toFixed(3)}deg) rotateX(${(-el).toFixed(3)}deg) translateZ(${-radius}px)`;
        }
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.67, 3);
      lastTime = now;
      if (!dragging) {
        yaw += velocityX * dt;
        pitch += velocityY * dt;
        // Retour progressif à la dérive lente après un lancer.
        const drift = reduced ? 0 : 0.02;
        velocityX += (drift - velocityX) * 0.04 * dt;
        velocityY += (0 - velocityY) * 0.05 * dt;
      }
      lookX += (targetLookX - lookX) * 0.06 * dt;
      lookY += (targetLookY - lookY) * 0.06 * dt;
      // Le dôme n'est plus visible une fois l'accueil dépassé : inutile de le calculer.
      if (window.scrollY < window.innerHeight * 1.2) render();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onPointerMove = (event: PointerEvent) => {
      if (dragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        const factor = 57.3 / radius;
        yaw += dx * factor;
        pitch -= dy * factor;
        velocityX = dx * factor;
        velocityY = -dy * factor;
        return;
      }
      if (reduced || event.pointerType !== "mouse") return;
      targetLookX = (event.clientX / window.innerWidth - 0.5) * 10;
      targetLookY = -(event.clientY / window.innerHeight - 0.5) * 6;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      root.dataset.dragging = "true";
    };
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      // Convertit le dernier déplacement en élan, borné.
      velocityX = Math.max(-2.5, Math.min(2.5, velocityX * 1.6));
      velocityY = Math.max(-2.5, Math.min(2.5, velocityY * 1.6));
      delete root.dataset.dragging;
    };

    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    // Apparition : on attend les premières images pour ne pas révéler de cases vides.
    const firstImages = Array.from(root.querySelectorAll("img")).slice(0, images.length);
    const ready = Promise.race([
      Promise.all(firstImages.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))),
      new Promise((resolve) => setTimeout(resolve, 1800)),
    ]);
    let revealTimer = 0;
    ready.then(() => {
      revealTimer = window.setTimeout(() => (root.dataset.status = "ready"), reduced ? 0 : 900);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(revealTimer);
      window.removeEventListener("resize", resize);
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [images.length]);

  const count = COLS * ROWS;

  return (
    <div className="dome" ref={rootRef} data-status="idle" aria-hidden="true">
      <div className="dome-stage">
        {Array.from({ length: count }, (_, index) => {
          const col = index % COLS;
          const row = Math.floor(index / COLS);
          // Distance au centre : ordre d'apparition, du cœur vers les bords.
          const distance = Math.hypot(col - (COLS - 1) / 2, (row - (ROWS - 1) / 2) * 1.3);
          const src = images[(col * 3 + row * 5) % images.length];
          return (
            <div
              key={index}
              className="dome-tile"
              ref={(node) => {
                tileRefs.current[index] = node;
              }}
              style={{ "--d": distance.toFixed(2) } as React.CSSProperties}
            >
              <div className="dome-tile-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" draggable={false} decoding="async" width={405} height={540} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="dome-shade" />
    </div>
  );
}
