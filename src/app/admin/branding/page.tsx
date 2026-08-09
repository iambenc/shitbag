import { getCurrentTenant } from "@/lib/tenant/resolve";
import { requireTenantAdmin } from "@/lib/actions/shared";
import { BrandingForm } from "./BrandingForm";

export default async function AdminBrandingPage() {
  await requireTenantAdmin();
  const tenant = await getCurrentTenant();

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-semibold">Branding</h2>
      <p className="mt-1 text-sm text-(--text-muted)">Changes apply to everyone on this tenant immediately.</p>
      <div className="mt-6">
        <BrandingForm
          tenant={{
            displayName: tenant.displayName,
            logoUrl: tenant.logoUrl,
            primaryColor: tenant.primaryColor,
            secondaryColor: tenant.secondaryColor,
            customDomain: tenant.customDomain,
          }}
        />
      </div>
    </div>
  );
}
