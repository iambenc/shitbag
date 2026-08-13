import Link from "next/link";

// Not dismissible, unlike UpgradeBanner — the spec is explicit that this
// should "remain until they have" completed both, so there's no
// sessionStorage dismiss state to manage; a plain server component that
// re-evaluates hasEquipment/hasSeeds on every dashboard load is enough.
// Garden equipment and seed inventory used to be required onboarding steps
// (see src/lib/onboarding/steps.ts's comment) — this is what replaced them:
// a new user reaches the dashboard faster, then gets nudged to finish both
// here instead of being blocked from moving on.
export function SetupBanner({ hasEquipment, hasSeeds }: { hasEquipment: boolean; hasSeeds: boolean }) {
  if (hasEquipment && hasSeeds) return null;

  return (
    <div className="mt-8 rounded-lg border-l-4 border-l-(--brand-primary) bg-(--brand-primary)/10 px-4 py-3 text-sm">
      <p className="font-medium">Finish setting up your garden</p>
      <p className="mt-1 text-(--text-muted)">
        The grow planner and calendar work best once we know what you&rsquo;ve got.
      </p>
      <div className="mt-2 flex flex-wrap gap-4">
        {!hasEquipment && (
          <Link href="/garden" className="font-medium text-(--brand-primary) underline">
            Add equipment →
          </Link>
        )}
        {!hasSeeds && (
          <Link href="/seeds" className="font-medium text-(--brand-primary) underline">
            Add seeds →
          </Link>
        )}
      </div>
    </div>
  );
}
