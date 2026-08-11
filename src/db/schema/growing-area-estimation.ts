import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { tenantIsolationPolicy } from "./_rls";

export const growingAreaEstimationStatusEnum = ["pending", "complete", "failed"] as const;
export type GrowingAreaEstimationStatus = (typeof growingAreaEstimationStatusEnum)[number];

/**
 * One "estimate my garden from photos" run. Deliberately holds only the raw
 * AI output (rawOutput jsonb) — not a normalized child table of proposed
 * areas — because that output is read exactly once (the review page) and
 * either discarded or turned into real `growingAreas` rows; it's never
 * edited in place. The review page's client-side row state is the only
 * "editing" that ever happens to a proposal, and that's submitted fresh to
 * confirmGrowingAreaProposalsAction rather than written back here.
 */
export const growingAreaEstimations = pgTable(
  "growing_area_estimations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // One or more photos of the user's growing space(s), sent to the agent
    // together in one call — not one row per photo, since the AI's proposed
    // area list isn't necessarily 1:1 with input photos (one photo can show
    // several areas; several photos can show the same one).
    photoStorageKeys: jsonb("photo_storage_keys").$type<string[]>().notNull(),
    // Stored separately from photoStorageKeys, not derived from it — same
    // reasoning as photoJournalEntries storing both storageKey and url:
    // the local filesystem backend's url happens to be a deterministic
    // `/uploads/${key}`, but a future storage backend (R2, a CDN, a signed
    // URL) might not be, so the review page shouldn't assume that shape.
    // Nullable: rows created before this column existed have none, and
    // simply don't render photos rather than needing a backfill.
    photoUrls: jsonb("photo_urls").$type<string[]>(),
    status: text("status", { enum: growingAreaEstimationStatusEnum }).notNull().default("pending"),
    provider: text("provider"),
    model: text("model"),
    rawOutput: jsonb("raw_output"),
    errorMessage: text("error_message"),
    // Set (via an atomic guarded UPDATE, not a separate read-then-write —
    // see confirmGrowingAreaProposalsAction) once the user has reviewed and
    // confirmed a set of proposals into real growingAreas rows. Guards
    // against a double-click/two-tab double-apply creating duplicate areas.
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [tenantIsolationPolicy("growing_area_estimations", table.tenantId)],
).enableRLS();
