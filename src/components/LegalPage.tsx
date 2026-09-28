import type { LegalDocument } from "@/lib/legal-docs";

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <article className="prose">
      <p className="eyebrow">{document.updated || "Informations"}</p>
      <h1>{document.title}</h1>
      {document.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
