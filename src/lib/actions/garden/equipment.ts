"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { applyEquipmentRows, equipmentRowsSchema, type EquipmentState } from "@/lib/garden/equipmentRows";
import { shoppingListItems } from "@/db/schema";

export type { EquipmentState };

export async function updateEquipmentAction(
  _prevState: EquipmentState,
  formData: FormData,
): Promise<EquipmentState> {
  let rows;
  try {
    rows = equipmentRowsSchema.parse(JSON.parse(String(formData.get("rows") ?? "[]")));
  } catch {
    return { error: "Something went wrong reading your equipment list — please try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await applyEquipmentRows(tx, { tenantId, userId, rows });

    // The user just told us they own these — don't keep nagging them to buy
    // what's now confirmed owned. Marked purchased rather than deleted, so
    // it still shows in the "already got" section instead of vanishing.
    const ownedTypeIds = rows.map((r) => r.equipmentTypeId);
    if (ownedTypeIds.length > 0) {
      await tx
        .update(shoppingListItems)
        .set({ status: "purchased" })
        .where(
          and(
            eq(shoppingListItems.userId, userId),
            eq(shoppingListItems.status, "pending"),
            inArray(shoppingListItems.equipmentTypeId, ownedTypeIds),
          ),
        );
    }
  });

  revalidatePath("/garden");
  revalidatePath("/shopping-list");
  return { success: true };
}
