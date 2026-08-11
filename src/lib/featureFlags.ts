// Deliberately a hardcoded constant, not an env var: for a small number of
// flags, a code change that shows up in git history/review is a clearer
// "we're launching this" signal than an environment variable that could
// silently differ (or be forgotten) across environments. Flip to true and
// redeploy when a feature is ready to go live.
export const FEATURE_FLAGS = {
  // "Savings report" (src/app/savings/page.tsx) — estimated £ value of what
  // a user has grown themselves, based on crops.estimatedRetailPricePerKgGbp.
  // Built and paid-gated, kept off pending a monetisation decision on how
  // it's positioned.
  moneySavedReport: false,
} as const;
