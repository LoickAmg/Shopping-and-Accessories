import type { MetadataRoute } from "next";

import { siteUrl } from "@/payments/registry";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/compte", "/panier", "/commande", "/paiement", "/api"] },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
