/**
 * Découpe un texte en lettres masquées, animables une à une en CSS (`--i`).
 * Le texte complet reste lisible par les lecteurs d'écran via `aria-label`.
 */
export function SplitLetters({ text, className, as: Tag = "span", id }: { text: string; className?: string; as?: "span" | "h1" | "h2"; id?: string }) {
  let index = 0;
  return (
    <Tag className={className} aria-label={text} id={id}>
      {text.split(" ").map((word, wordIndex) => (
        <span className="split-word" aria-hidden="true" key={wordIndex}>
          {Array.from(word).map((letter) => (
            <span className="split-mask" key={index}>
              <span className="split-letter" style={{ "--i": index++ } as React.CSSProperties}>
                {letter}
              </span>
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}

/** Texte découpé en caractères dont l'opacité suit la progression du défilement (`--p`). */
export function ScrollText({ text }: { text: string }) {
  const total = Array.from(text.replace(/\s/g, "")).length;
  let index = 0;
  return (
    <span style={{ "--n": total } as React.CSSProperties}>
      <span className="sr-only">{text}</span>
      {text.split(" ").map((word, wordIndex) => (
        <span className="scroll-word" aria-hidden="true" key={wordIndex}>
          {Array.from(word).map((char) => (
            <span className="scroll-char" key={index} style={{ "--i": index++ } as React.CSSProperties}>
              {char}
            </span>
          ))}{" "}
        </span>
      ))}
    </span>
  );
}
