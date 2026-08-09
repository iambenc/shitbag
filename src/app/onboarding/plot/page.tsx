import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { getUserProfile } from "@/lib/onboarding/profile";
import { PlotForm } from "./PlotForm";

export default async function PlotStepPage() {
  const session = await auth();
  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session!.user.id, tenant.id);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">Tell us about your plot</h1>
      <p className="text-sm text-(--text-muted)">Step 3 of 6</p>
      <div className="mt-4">
        <PlotForm
          initial={{
            plotSize: profile?.plotSize ?? null,
            avgSunlightHours: profile?.avgSunlightHours ?? null,
            householdSize: profile?.householdSize ?? null,
            hasIndoorSeedlingSpace: profile?.hasIndoorSeedlingSpace ?? null,
          }}
        />
      </div>
    </div>
  );
}
