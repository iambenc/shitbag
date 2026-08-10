ALTER TABLE "crops" ADD COLUMN "estimated_retail_price_per_kg_gbp" real DEFAULT 0 NOT NULL;--> statement-breakpoint
-- One-time backfill, not a default change: these 29 rows already existed
-- before this migration (25 curated seed crops + 4 unverified AI-added ones
-- from real usage), so the column default above would otherwise leave them
-- all at 0 — an obviously wrong price, not a genuine "unknown" state. Values
-- are the same general-knowledge UK-supermarket £/kg (or kg-equivalent for
-- crops normally sold by bunch/head/unit) estimates now also seeded in
-- src/db/seed-data/crops.ts for a fresh database; not sourced from an
-- authoritative dataset, same spirit as that file's own existing figures.
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 3.50 WHERE "slug" = 'tomato';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 1.00 WHERE "slug" = 'potato';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 0.90 WHERE "slug" = 'carrot';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 1.00 WHERE "slug" = 'onion';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 2.50 WHERE "slug" = 'courgette';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 4.00 WHERE "slug" = 'runner-bean';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 5.00 WHERE "slug" = 'french-bean';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 4.50 WHERE "slug" = 'pea';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 3.50 WHERE "slug" = 'lettuce';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 7.00 WHERE "slug" = 'spinach';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 5.00 WHERE "slug" = 'kale';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 1.20 WHERE "slug" = 'cabbage';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 3.00 WHERE "slug" = 'broccoli';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 1.80 WHERE "slug" = 'beetroot';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 4.00 WHERE "slug" = 'radish';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 6.00 WHERE "slug" = 'spring-onion';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 9.00 WHERE "slug" = 'garlic';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 2.50 WHERE "slug" = 'leek';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 3.50 WHERE "slug" = 'sweetcorn';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 1.80 WHERE "slug" = 'squash';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 8.00 WHERE "slug" = 'strawberry';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 16.00 WHERE "slug" = 'raspberry';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 12.00 WHERE "slug" = 'chilli-pepper';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 1.50 WHERE "slug" = 'cucumber';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 35.00 WHERE "slug" = 'basil';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 8.00 WHERE "slug" = 'lambs-lettuce';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 4.00 WHERE "slug" = 'pak-choi';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 1.80 WHERE "slug" = 'spring-cabbage';--> statement-breakpoint
UPDATE "crops" SET "estimated_retail_price_per_kg_gbp" = 5.00 WHERE "slug" = 'swiss-chard';
