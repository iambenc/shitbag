import Link from "next/link";
import { requireTenantAdmin } from "@/lib/actions/shared";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/branding", label: "Branding" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/ai", label: "AI providers" },
  { href: "/admin/equipment", label: "Equipment" },
  { href: "/admin/reports", label: "Reports" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireTenantAdmin();

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Tenant admin</h1>
        <nav className="mt-4 flex flex-wrap gap-2 text-sm">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-(--brand-primary)/30 px-3 py-1 hover:bg-(--brand-primary)/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
