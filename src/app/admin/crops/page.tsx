import { asc, isNotNull } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { crops, partnerLinks } from "@/db/schema";
import { requireTenantAdmin } from "@/lib/actions/shared";
import { CropLinksView } from "./CropLinksView";

export default async function AdminCropsPage() {
  const { tenantId } = await requireTenantAdmin();

  const [allCrops, links] = await Promise.all([
    // Global catalog, not tenant-scoped — same as shopping-list/page.tsx's
    // read of the same table.
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
    withTenant(tenantId, (tx) =>
      tx.select().from(partnerLinks).where(isNotNull(partnerLinks.cropId)),
    ),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="font-display text-lg font-semibold">Crops &amp; partner links</h2>
      <p className="mt-1 text-sm text-(--text-muted)">
        Where gardeners can buy seeds for each crop in the catalog. The crop catalog itself is
        shared across every tenant and can&rsquo;t be edited here — only your own shop links.
      </p>
      <div className="mt-8">
        <CropLinksView
          crops={allCrops.map((c) => ({ id: c.id, slug: c.slug, name: c.name, emoji: c.emoji }))}
          links={links.map((l) => ({ ...l, cropId: l.cropId as string }))}
        />
      </div>
    </div>
  );
}
