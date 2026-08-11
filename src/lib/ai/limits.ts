export const MAX_DAILY_GROW_PLAN_GENERATIONS = 3;
export const MAX_RECOMMENDATION_REGENERATIONS = 5;
export const MAX_DAILY_PLANT_DIAGNOSES = 5;
export const MAX_DAILY_GROWING_AREA_ESTIMATIONS = 3;
export const MAX_ESTIMATION_PHOTOS = 5;
// Adding a seed for a crop already in the catalog is a cheap DB insert, but
// an unrecognized crop name triggers a real cropFacts AI call to backfill
// it — this bounds that worst case, same reasoning as every other AI-cost-
// relevant action in this app. Higher than those (3-5/day) since most real
// adds resolve to an existing crop for free and this is a genuine "catch up
// my whole inventory in one sitting" action, not a per-generation one.
export const MAX_DAILY_SEED_ADDITIONS = 10;
