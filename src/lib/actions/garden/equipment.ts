"use server";

import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/tenant/withTenant";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { applyEquipmentRows, equipmentRowsSchema, type EquipmentState } from "@/lib/garden/equipmentRows";

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
  await withTenant(tenantId, (tx) => applyEquipmentRows(tx, { tenantId, userId, rows }));

  revalidatePath("/garden");
  return { success: true };
}
