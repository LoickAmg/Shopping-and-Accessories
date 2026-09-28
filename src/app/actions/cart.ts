"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { UnavailableProductError, addToCart, removeFromCart, setQuantity } from "@/server/cart";
import { CART_COOKIE, cookieOptions, getCartId, getCurrentUser } from "@/server/context";

const addSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  slug: z.string().min(1).max(200),
});

export async function addToCartAction(formData: FormData): Promise<void> {
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/boutique");
  const { productId, quantity, slug } = parsed.data;

  const db = await getDb();
  const user = await getCurrentUser();
  try {
    const { cartId } = await addToCart(db, { cartId: await getCartId(), userId: user?.id ?? null, productId, quantity });
    (await cookies()).set(CART_COOKIE, cartId, cookieOptions(new Date(Date.now() + 60 * 24 * 3600 * 1000)));
  } catch (error) {
    if (error instanceof UnavailableProductError) redirect(`/produit/${slug}?indisponible=1`);
    throw error;
  }
  redirect(`/produit/${slug}?ajoute=1`);
}

const lineSchema = z.object({ productId: z.coerce.number().int().positive() });

export async function updateQuantityAction(formData: FormData): Promise<void> {
  const parsed = lineSchema.extend({ quantity: z.coerce.number().int().min(0).max(50) }).safeParse(Object.fromEntries(formData));
  const cartId = await getCartId();
  if (parsed.success && cartId) await setQuantity(await getDb(), cartId, parsed.data.productId, parsed.data.quantity);
  redirect("/panier");
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  const parsed = lineSchema.safeParse(Object.fromEntries(formData));
  const cartId = await getCartId();
  if (parsed.success && cartId) await removeFromCart(await getDb(), cartId, parsed.data.productId);
  redirect("/panier");
}
