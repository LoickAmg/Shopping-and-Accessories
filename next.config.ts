import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // PGlite (base embarquée du développement) charge ses fichiers WebAssembly par URL : il ne doit pas être empaqueté.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: { root: path.resolve(import.meta.dirname) },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HTTPS obligatoire pendant deux ans (ignoré par les navigateurs en http://localhost).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Équivalent moderne de X-Frame-Options : le site ne s'affiche dans aucun cadre.
          // (Pas de `form-action 'self'` : la commande redirige vers la page de paiement Stripe.)
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
