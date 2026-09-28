import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";
import { shippingAndReturns } from "@/lib/legal-docs";

const document = shippingAndReturns();

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: "/livraison-retours" },
};

export default function Page() {
  return <LegalPage document={shippingAndReturns()} />;
}
