import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";
import { termsOfSale } from "@/lib/legal-docs";

const document = termsOfSale();

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/cgv" },
};

export default function Page() {
  return <LegalPage document={termsOfSale()} />;
}
