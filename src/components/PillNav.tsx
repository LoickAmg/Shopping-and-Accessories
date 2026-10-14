"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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

/** Contenu du menu « Boutique » : univers, familles de rayons et sélections. */
const SHOP_MENU: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Univers",
    links: [
      { href: "/boutique?univers=femme", label: "Femme" },
      { href: "/boutique?univers=homme", label: "Homme" },
      { href: "/boutique?univers=enfant", label: "Enfant" },
    ],
  },
  {
    title: "Rayons",
    links: [
      { href: "/boutique?famille=vetements", label: "Vêtements" },
      { href: "/boutique?famille=sacs", label: "Sacs" },
      { href: "/boutique?famille=bijoux", label: "Bijoux" },
      { href: "/boutique?famille=accessoires", label: "Accessoires" },
    ],
  },
  {
    title: "Sélections",
    links: [
      { href: "/boutique?etat=seconde_main", label: "Friperie" },
      { href: "/boutique?etat=fin_de_serie", label: "Fin de série" },
      { href: "/boutique", label: "Tout le catalogue" },
    ],
  },
];

const SHOP_INDEX = ITEMS.findIndex((item) => item.href === "/boutique");

/** Navigation en pilule : un fond blanc glisse sous l'entrée active ou survolée. */
export function PillNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const [section, setSection] = useState("intro");
  const [hovered, setHovered] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

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

  // Le menu se ferme au changement de page, sur Échap et sur un clic en dehors.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        navRef.current?.querySelector<HTMLButtonElement>(".pill-nav-toggle")?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  const openOnHover = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    setMenuOpen(true);
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMenuOpen(false), 180);
  };

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
    <nav
      className="pill-nav"
      aria-label="Navigation principale"
      ref={navRef}
      onPointerLeave={(event) => {
        setHovered(null);
        if (event.pointerType === "mouse") closeSoon();
      }}
    >
      <span className="pill-nav-pill" ref={pillRef} aria-hidden="true" />
      {ITEMS.map((item, index) => (
        <Fragment key={item.href}>
          <Link
            href={item.href}
            aria-current={index === activeIndex ? "page" : undefined}
            data-on={index === target ? "true" : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setHovered(index);
              if (index === SHOP_INDEX) openOnHover(event);
              else if (event.pointerType === "mouse") closeSoon();
            }}
          >
            {item.label}
          </Link>
          {/* Le chevron suit « Boutique » ; la pilule ne compte que les liens, il ne la décale pas. */}
          {index === SHOP_INDEX && (
            <button
              type="button"
              className="pill-nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="shop-menu"
              aria-label={menuOpen ? "Fermer le menu Boutique" : "Ouvrir le menu Boutique"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">▾</span>
            </button>
          )}
        </Fragment>
      ))}
      <div
        className="shop-menu"
        id="shop-menu"
        hidden={!menuOpen}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") window.clearTimeout(closeTimer.current);
        }}
      >
        {SHOP_MENU.map((group) => (
          <div className="shop-menu-group" key={group.title}>
            <p className="shop-menu-title">{group.title}</p>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={() => setMenuOpen(false)}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
