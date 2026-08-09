import Link from "next/link";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { photoReports } from "@/db/schema";
import { requireTenantAdmin } from "@/lib/actions/shared";

const SECTIONS = [
  { href: "/admin/branding", title: "Branding", description: "Display name, logo, colors, and custom domain." },
  { href: "/admin/billing", title: "Billing", description: "Membership price, currency, and trial length." },
  { href: "/admin/ai", title: "AI providers", description: "Per-agent model and API key configuration." },
  {
    href: "/admin/equipment",
    title: "Equipment & partner links",
    description: "Equipment types gardeners can pick from, and where to buy them.",
  },
];

export default async function AdminOverviewPage() {
  const { tenantId } = await requireTenantAdmin();

  const pendingCount = await withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: photoReports.id })
      .from(photoReports)
      .where(eq(photoReports.status, "pending"));
    return rows.length;
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="flex items-center justify-between rounded-lg border border-black/10 bg-white p-6 hover:border-(--brand-primary)/40"
        >
          <div>
            <p className="font-medium">{s.title}</p>
            <p className="mt-1 text-sm text-(--text-muted)">{s.description}</p>
          </div>
          <span aria-hidden className="text-xl text-(--brand-primary)">
            →
          </span>
        </Link>
      ))}
      <Link
        href="/admin/reports"
        className="flex items-center justify-between rounded-lg border border-black/10 bg-white p-6 hover:border-(--brand-primary)/40"
      >
        <div>
          <p className="font-medium">Reports</p>
          <p className="mt-1 text-sm text-(--text-muted)">Review photos reported by gardeners.</p>
        </div>
        {pendingCount > 0 ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            {pendingCount} pending
          </span>
        ) : (
          <span aria-hidden className="text-xl text-(--brand-primary)">
            →
          </span>
        )}
      </Link>
    </div>
  );
}
