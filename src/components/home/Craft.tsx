"use client";

import { useEffect, useRef, useState } from "react";

export interface CraftValue {
  word: string;
  lead: string;
  image: string;
  details: { title: string; text: string }[];
}

const DURATION = 7000;

/**
 * « Anatomie d'une pièce » : quatre exigences en onglets. À gauche les mots,
 * au centre le sac détouré, à droite le texte et les détails de fabrication.
 * L'onglet avance seul (barre de progression) et s'arrête au survol ou au focus.
 */
export function Craft({ values }: { values: CraftValue[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // N'avance que lorsque la section est à l'écran.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => {
      setActive((index) => (index + 1) % values.length);
      setCycle((count) => count + 1);
    }, DURATION);
    return () => clearTimeout(timer);
  }, [active, paused, visible, cycle, values.length]);

  const select = (index: number) => {
    setActive(index);
    setCycle((count) => count + 1);
  };

  const current = values[active];
  const running = !paused && visible;

  return (
    <div
      className="craft"
      ref={rootRef}
      data-running={running ? "true" : undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="craft-tabs" role="tablist" aria-label="Nos exigences">
        {values.map((value, index) => (
          <button
            key={value.word}
            type="button"
            role="tab"
            id={`craft-tab-${index}`}
            aria-selected={index === active}
            aria-controls="craft-panel"
            className="craft-tab"
            onClick={() => select(index)}
          >
            <span className="craft-tab-n">{String(index + 1).padStart(2, "0")}</span>
            <span className="craft-tab-word" data-text={value.word}>
              <span>{value.word}</span>
            </span>
            {index === active && <span className="craft-tab-bar" key={`${cycle}-${running}`} data-running={running ? "" : undefined} aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="craft-stage" aria-hidden="true">
        <div className="craft-halo" />
        {values.map((value, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={value.word} className="cutout" src={value.image} alt="" data-on={index === active ? "true" : undefined} width={810} height={1080} loading="lazy" />
        ))}
      </div>

      <div className="craft-panel" id="craft-panel" role="tabpanel" aria-labelledby={`craft-tab-${active}`} key={active}>
        <p className="craft-kicker">
          {String(active + 1).padStart(2, "0")} — {current.word}
        </p>
        <p className="craft-lead">{current.lead}</p>
        <ul className="craft-details">
          {current.details.map((detail, index) => (
            <li key={detail.title} style={{ "--i": index } as React.CSSProperties}>
              <span className="craft-detail-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path d="M12 2.5l2.4 7.1h7.1l-5.7 4.3 2.2 7.1L12 16.6 6 21l2.2-7.1-5.7-4.3h7.1z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </span>
              <span>
                <strong>{detail.title}</strong>
                <span>{detail.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
