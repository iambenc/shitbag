export const ONBOARDING_STEPS = [
  { path: "location", label: "Location" },
  { path: "crops", label: "Favourites" },
  { path: "plot", label: "Your Plot" },
  { path: "equipment", label: "Equipment" },
  { path: "seeds", label: "Seeds" },
  { path: "experience", label: "Experience" },
] as const;

export type OnboardingStepPath = (typeof ONBOARDING_STEPS)[number]["path"];

export function nextOnboardingStep(path: OnboardingStepPath): string {
  const index = ONBOARDING_STEPS.findIndex((s) => s.path === path);
  const next = ONBOARDING_STEPS[index + 1];
  return next ? `/onboarding/${next.path}` : "/dashboard";
}
