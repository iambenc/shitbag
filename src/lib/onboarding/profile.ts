import "server-only";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userProfiles } from "@/db/schema";

/** Every user gets a userProfiles row at signup, so this should always find one. */
export async function getUserProfile(userId: string, tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return row;
  });
}
