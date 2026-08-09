import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withTenant } from "@/lib/tenant/withTenant";
import { photoReports, photoJournalEntries, users } from "@/db/schema";
import { requireTenantAdmin } from "@/lib/actions/shared";
import { ReportsView } from "./ReportsView";

export default async function AdminReportsPage() {
  const { tenantId } = await requireTenantAdmin();

  const reports = await withTenant(tenantId, async (tx) => {
    const owner = alias(users, "owner");
    const reporter = alias(users, "reporter");
    return tx
      .select({
        id: photoReports.id,
        reason: photoReports.reason,
        createdAt: photoReports.createdAt,
        photoId: photoJournalEntries.id,
        photoUrl: photoJournalEntries.url,
        ownerEmail: owner.email,
        reporterEmail: reporter.email,
      })
      .from(photoReports)
      .innerJoin(photoJournalEntries, eq(photoReports.photoJournalEntryId, photoJournalEntries.id))
      .innerJoin(owner, eq(photoJournalEntries.userId, owner.id))
      .innerJoin(reporter, eq(photoReports.reportedByUserId, reporter.id))
      .where(eq(photoReports.status, "pending"))
      .orderBy(photoReports.createdAt);
  });

  return (
    <div>
      <h2 className="text-lg font-semibold">Reports</h2>
      <p className="mt-1 text-sm text-[#1f2a1f]/70">Photos gardeners have reported from the shared feed.</p>
      <div className="mt-6">
        <ReportsView
          reports={reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
