"use client";

import Link from "next/link";
import { useState } from "react";

/** Libellé dont chaque lettre roule vers le haut au survol, en cascade. */
function Roll({ text }: { text: string }) {
  return (
    <span className="roll" aria-hidden="true">
      {Array.from(text).map((char, index) => (
        <span className="roll-ch" key={index} style={{ "--i": index } as React.CSSProperties}>
          <span>{char === " " ? " " : char}</span>
          <span>{char === " " ? " " : char}</span>
        </span>
      ))}
    </span>
  );
}

export function RollLink({ href, text, className }: { href: string; text: string; className?: string }) {
  return (
    <Link href={href} className={`roll-link ${className ?? ""}`} aria-label={text}>
      <Roll text={text} />
      <span className="roll-arrow" aria-hidden="true">↗</span>
    </Link>
  );
}

/** Adresse e-mail copiée d'un clic, avec retour visuel ; lien mailto sans JavaScript. */
export function CopyEmail({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "copied">("idle");

  const onClick = async (event: React.MouseEvent) => {
    if (!navigator.clipboard) return;
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(email);
      setState("copied");
      setTimeout(() => setState("idle"), 2200);
    } catch {
      window.location.href = `mailto:${email}`;
    }
  };

  return (
    <a href={`mailto:${email}`} className="copy-email" data-state={state} onClick={onClick}>
      <span className="copy-email-stack">
        <span>{email}</span>
        <span>Cliquer pour copier</span>
        <span>Copié !</span>
      </span>
      <span className="sr-only" role="status">{state === "copied" ? "Adresse copiée dans le presse-papiers" : ""}</span>
    </a>
  );
}
