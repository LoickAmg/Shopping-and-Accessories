import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";
import { contactPage } from "@/lib/legal-docs";

const document = contactPage();

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/contact" },
};

export default function Page() {
  return <LegalPage document={contactPage()} />;
}
