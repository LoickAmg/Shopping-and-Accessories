import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";
import { privacyPolicy } from "@/lib/legal-docs";

const document = privacyPolicy();

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/confidentialite" },
};

export default function Page() {
  return <LegalPage document={privacyPolicy()} />;
}
