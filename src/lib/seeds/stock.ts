import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { seedInventory } from "@/db/schema";

export type SeedStockRow = { varietyId: string | null; seedCount: number | null };

export type SeedStockResult = { known: true; total: number } | { known: false };

/**
 * Mirrors toggleTaskCompleteAction's exact bucket-preference logic
 * (src/lib/actions/tasks.ts): prefer numeric rows matching the task's own
 * variety; fall back to the variety-agnostic (varietyId null) numeric bucket
 * only if no variety-matched numeric rows exist. If the user owns literally
 * no seedInventory rows for this crop at all, that's an unambiguous zero —
 * they don't have any of this crop's seeds, full stop. But if rows DO exist
 * and none of them are numeric in the applicable bucket, that's genuinely
 * ambiguous, not zero: onboarding-sourced rows only ever record
 * quantityLabel, leaving seedCount null ("unknown quantity"), and a task
 * shouldn't be pushed back over the user's own uncounted stock. Deliberately
 * not combining both buckets into one cross-bucket sum: deduction only ever
 * draws from a single bucket, so a combined total here could pass a check
 * that deduction would then fail to actually satisfy.
 */
export function resolveSeedStock(rows: SeedStockRow[], varietyId: string | null): SeedStockResult {
  if (rows.length === 0) return { known: true, total: 0 };
  if (varietyId) {
    const varietyRows = rows.filter((r) => r.varietyId === varietyId && r.seedCount !== null);
    if (varietyRows.length > 0) {
      return { known: true, total: varietyRows.reduce((sum, r) => sum + (r.seedCount ?? 0), 0) };
    }
  }
  const agnosticRows = rows.filter((r) => r.varietyId === null && r.seedCount !== null);
  if (agnosticRows.length > 0) {
    return { known: true, total: agnosticRows.reduce((sum, r) => sum + (r.seedCount ?? 0), 0) };
  }
  return { known: false };
}

export async function getSeedStock(
  tx: Database,
  userId: string,
  cropId: string,
  varietyId: string | null,
): Promise<SeedStockResult> {
  const rows = await tx
    .select({ varietyId: seedInventory.varietyId, seedCount: seedInventory.seedCount })
    .from(seedInventory)
    .where(and(eq(seedInventory.userId, userId), eq(seedInventory.cropId, cropId)));
  return resolveSeedStock(rows, varietyId);
}
