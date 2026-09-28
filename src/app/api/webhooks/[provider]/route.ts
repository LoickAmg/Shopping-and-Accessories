import { getDb } from "@/db/client";
import { processPaymentNotification } from "@/payments/process";
import { getProvider } from "@/payments/registry";
import { InvalidSignatureError } from "@/payments/types";

export const dynamic = "force-dynamic";

/**
 * Réception des webhooks des fournisseurs de paiement. Le corps brut est lu tel
 * quel (la signature porte sur ces octets exacts), vérifié par le fournisseur,
 * puis traité de façon idempotente.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return Response.json({ error: "Fournisseur non configuré." }, { status: 404 });
  }
  if (!provider || providerId === "demo") return Response.json({ error: "Fournisseur inconnu." }, { status: 404 });

  const rawBody = await request.text();
  try {
    const notification = await provider.parseWebhook(rawBody, request.headers);
    if (!notification) return Response.json({ received: true, ignored: true });

    const result = await processPaymentNotification(await getDb(), provider.id, notification);
    // 200 même pour un avis rejeté (montant incohérent…) : le rejouer n'y changerait rien.
    return Response.json({ received: true, result: result.result });
  } catch (error) {
    if (error instanceof InvalidSignatureError) return Response.json({ error: "Signature invalide." }, { status: 400 });
    console.error("Webhook de paiement en échec :", error);
    return Response.json({ error: "Traitement impossible." }, { status: 500 });
  }
}
