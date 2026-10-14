"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { UnavailableProductError, addToCart, removeFromCart, setQuantity } from "@/server/cart";
import { CART_COOKIE, cookieOptions, getCartId, getCurrentUser } from "@/server/context";

const addSchema = z.object({
  productId: z.coerce.number().int().positive(),
  /** Déclinaison choisie (taille / couleur) ; obligatoire. */
  variantId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  slug: z.string().min(1).max(200),
});

export async function addToCartAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData);
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) {
    // Sans taille choisie, on renvoie sur la fiche avec un message plutôt que vers la boutique.
    const slug = typeof raw.slug === "string" && /^[a-z0-9-]{1,200}$/.test(raw.slug) ? raw.slug : null;
    redirect(slug && !raw.variantId ? `/produit/${slug}?taille=1` : "/boutique");
  }
  const { productId, variantId, quantity, slug } = parsed.data;

  const db = await getDb();
  const user = await getCurrentUser();
  try {
    const { cartId } = await addToCart(db, { cartId: await getCartId(), userId: user?.id ?? null, productId, variantId, quantity });
    (await cookies()).set(CART_COOKIE, cartId, cookieOptions(new Date(Date.now() + 60 * 24 * 3600 * 1000)));
  } catch (error) {
    if (error instanceof UnavailableProductError) redirect(`/produit/${slug}?indisponible=1`);
    throw error;
  }
  // Le compteur du panier vit dans le layout, qui n'est pas recalculé sans cela après une action.
  revalidatePath("/", "layout");
  redirect(`/produit/${slug}?ajoute=1`);
}

const lineSchema = z.object({ variantId: z.coerce.number().int().positive() });

export async function updateQuantityAction(formData: FormData): Promise<void> {
  const parsed = lineSchema.extend({ quantity: z.coerce.number().int().min(0).max(50) }).safeParse(Object.fromEntries(formData));
  const cartId = await getCartId();
  if (parsed.success && cartId) await setQuantity(await getDb(), cartId, parsed.data.variantId, parsed.data.quantity);
  revalidatePath("/", "layout");
  redirect("/panier");
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  const parsed = lineSchema.safeParse(Object.fromEntries(formData));
  const cartId = await getCartId();
  if (parsed.success && cartId) await removeFromCart(await getDb(), cartId, parsed.data.variantId);
  revalidatePath("/", "layout");
  redirect("/panier");
}
