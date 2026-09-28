"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Entrées dans l'ordre des sections de l'accueil : en faisant défiler la page,
 * la pilule avance de gauche à droite. `section` est l'identifiant de la
 * section de l'accueil qui allume l'entrée ; `match` sert sur les autres pages.
 */
const ITEMS = [
  { href: "/", label: "Accueil", section: "intro", match: (path: string) => path === "/" },
  { href: "/#pieces", label: "Pièces", section: "pieces", match: () => false },
  { href: "/boutique", label: "Boutique", section: "rayons", match: (path: string) => path.startsWith("/boutique") || path.startsWith("/produit") },
  { href: "/a-propos", label: "Maison", section: "maison", match: (path: string) => path.startsWith("/a-propos") },
];

/** Navigation en pilule : un fond blanc glisse sous l'entrée active ou survolée. */
export function PillNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const [section, setSection] = useState("intro");
  const [hovered, setHovered] = useState<number | null>(null);

  const onHome = pathname === "/";
  const activeIndex = onHome ? ITEMS.findIndex((item) => item.section === section) : ITEMS.findIndex((item) => item.match(pathname));
  const target = hovered ?? activeIndex;

  // Sur l'accueil : la section active est la dernière dont le haut a franchi le milieu de l'écran.
  useEffect(() => {
    if (!onHome) return;
    const sections = ITEMS.map((item) => document.getElementById(item.section)).filter((element): element is HTMLElement => element !== null);
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.5;
      let current = "intro";
      for (const element of sections) {
        if (element.getBoundingClientRect().top <= line) current = element.id;
      }
      setSection(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Au premier rendu, la mise en page peut ne pas être finie : on recalcule quand la page change de taille.
    const resizeObserver = new ResizeObserver(onScroll);
    resizeObserver.observe(document.body);
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [onHome]);

  const place = useCallback(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const link = nav.querySelectorAll<HTMLAnchorElement>("a")[target];
    if (!link) {
      pill.style.opacity = "0";
      return;
    }
    pill.style.opacity = "1";
    pill.style.width = `${link.offsetWidth}px`;
    pill.style.transform = `translateX(${link.offsetLeft}px)`;
  }, [target]);

  useLayoutEffect(place, [place]);
  useEffect(() => {
    window.addEventListener("resize", place);
    document.fonts?.ready.then(place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  return (
    <nav className="pill-nav" aria-label="Navigation principale" ref={navRef} onPointerLeave={() => setHovered(null)}>
      <span className="pill-nav-pill" ref={pillRef} aria-hidden="true" />
      {ITEMS.map((item, index) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={index === activeIndex ? "page" : undefined}
          data-on={index === target ? "true" : undefined}
          onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(index)}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
