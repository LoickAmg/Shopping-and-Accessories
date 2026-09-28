import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";
import { legalNotice } from "@/lib/legal-docs";

const document = legalNotice();

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/mentions-legales" },
};

export default function Page() {
  return <LegalPage document={legalNotice()} />;
}
