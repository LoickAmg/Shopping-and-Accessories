import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";
import { aboutPage } from "@/lib/legal-docs";

const document = aboutPage();

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/a-propos" },
};

export default function Page() {
  return <LegalPage document={aboutPage()} />;
}
