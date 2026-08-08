import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { getUserProfile } from "@/lib/onboarding/profile";
import { ExperienceForm } from "./ExperienceForm";

export default async function ExperienceStepPage() {
  const session = await auth();
  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session!.user.id, tenant.id);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">Last thing</h1>
      <p className="text-sm text-[#1f2a1f]/70">Step 6 of 6</p>
      <div className="mt-4">
        <ExperienceForm
          initial={{
            expertiseLevel: profile?.expertiseLevel ?? null,
            weekdayHoursAvailable: profile?.weekdayHoursAvailable ?? null,
            weekendHoursAvailable: profile?.weekendHoursAvailable ?? null,
          }}
        />
      </div>
    </div>
  );
}
