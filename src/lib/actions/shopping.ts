"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { shoppingListItems } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";

const addItemSchema = z
  .object({
    cropId: z.string().uuid().optional().or(z.literal("")),
    equipmentTypeId: z.string().uuid().optional().or(z.literal("")),
    freeText: z.string().trim().max(200).optional().or(z.literal("")),
    quantityLabel: z.string().trim().min(1, "Enter a quantity").max(100),
  })
  .refine(
    (v) => [v.cropId, v.equipmentTypeId, v.freeText].filter(Boolean).length === 1,
    { message: "Pick a crop, equipment, or enter a custom item — exactly one" },
  );

export type CreatedShoppingItem = {
  id: string;
  cropId: string | null;
  equipmentTypeId: string | null;
  freeText: string | null;
  quantityLabel: string;
  status: "pending";
};

export type AddShoppingItemState = { error?: string; item?: CreatedShoppingItem };

export async function addShoppingItemAction(
  _prevState: AddShoppingItemState,
  formData: FormData,
): Promise<AddShoppingItemState> {
  const parsed = addItemSchema.safeParse({
    cropId: formData.get("cropId") ?? "",
    equipmentTypeId: formData.get("equipmentTypeId") ?? "",
    freeText: formData.get("freeText") ?? "",
    quantityLabel: formData.get("quantityLabel"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  const item = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(shoppingListItems)
      .values({
        tenantId,
        userId,
        cropId: parsed.data.cropId || null,
        equipmentTypeId: parsed.data.equipmentTypeId || null,
        freeText: parsed.data.freeText || null,
        quantityLabel: parsed.data.quantityLabel,
      })
      .returning();
    return row;
  });

  return {
    item: {
      id: item.id,
      cropId: item.cropId,
      equipmentTypeId: item.equipmentTypeId,
      freeText: item.freeText,
      quantityLabel: item.quantityLabel,
      status: "pending",
    },
  };
}

export async function toggleShoppingItemAction(itemId: string, purchased: boolean): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(shoppingListItems)
      .set({ status: purchased ? "purchased" : "pending" })
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.userId, userId)));
  });
}

export async function deleteShoppingItemAction(itemId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx
      .delete(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.userId, userId)));
  });
}
