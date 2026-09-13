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
  // "Plot planner" spatial drag canvas (src/app/garden/layout/**) — placing
  // growing areas at exact x/y positions, either on the main plot or inside
  // a structure's own sub-plot. Built and working, kept off while /garden's
  // simpler owned/placed/inventory view (no positioning) is the primary
  // flow. Auto-placement (owning equipment already creates real growing
  // space) and everything downstream of it — the grow planner, My Garden,
  // the dashboard — works fully without this; it only gates the canvas
  // itself and every link into it.
  layoutPlanning: false,
} as const;
