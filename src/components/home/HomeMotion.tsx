"use client";

import Lenis from "lenis";
import { useEffect } from "react";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * Chef d'orchestre des animations de l'accueil : défilement amorti, progression
 * du hero, texte révélé lettre à lettre et révélations à l'entrée dans l'écran. Tout est
 * piloté par attributs `data-*` posés dans le rendu serveur, pour que la page
 * reste lisible sans JavaScript.
 */
export function HomeMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const lenis = reduced ? null : new Lenis({ lerp: 0.085, anchors: { offset: 0 } });
    let lenisFrame = 0;
    if (lenis) {
      const raf = (time: number) => {
        lenis.raf(time);
        lenisFrame = requestAnimationFrame(raf);
      };
      lenisFrame = requestAnimationFrame(raf);
    }

    const lede = document.querySelector<HTMLElement>("[data-lede]");
    const sheet = document.querySelector<HTMLElement>(".sheet");

    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      const heroProgress = clamp(window.scrollY / vh);
      root.style.setProperty("--hero-p", heroProgress.toFixed(4));
      // Au-delà du hero, le dôme est invisible : on le retire du rendu et des clics.
      if (heroProgress >= 0.95) root.dataset.pastHero = "";
      else delete root.dataset.pastHero;

      // L'en-tête passe en encre sombre quand il survole la feuille claire.
      if (sheet) {
        const rect = sheet.getBoundingClientRect();
        if (rect.top < 44 && rect.bottom > 44) root.dataset.headerLight = "";
        else delete root.dataset.headerLight;
      }

      if (lede) {
        const rect = lede.getBoundingClientRect();
        const progress = clamp((vh * 0.82 - rect.top) / (rect.height + vh * 0.1));
        lede.style.setProperty("--p", progress.toFixed(4));
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));

    return () => {
      cancelAnimationFrame(lenisFrame);
      lenis?.destroy();
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      root.style.removeProperty("--hero-p");
      delete root.dataset.pastHero;
      delete root.dataset.headerLight;
    };
  }, []);

  return null;
}
