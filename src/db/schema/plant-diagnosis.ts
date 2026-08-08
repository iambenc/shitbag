import { pgTable, uuid, text, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { photoJournalEntries } from "./photo";
import { tenantIsolationPolicy } from "./_rls";

export const plantDiagnosisStatusEnum = ["pending", "complete", "failed"] as const;
export type PlantDiagnosisStatus = (typeof plantDiagnosisStatusEnum)[number];

export const plantDiagnosisSeverityEnum = ["none", "low", "medium", "high"] as const;
export type PlantDiagnosisSeverity = (typeof plantDiagnosisSeverityEnum)[number];

export const plantDiagnoses = pgTable(
  "plant_diagnoses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    photoJournalEntryId: uuid("photo_journal_entry_id")
      .notNull()
      .references(() => photoJournalEntries.id, { onDelete: "cascade" }),
    status: text("status", { enum: plantDiagnosisStatusEnum }).notNull().default("pending"),
    provider: text("provider"),
    model: text("model"),
    // Denormalized for list display; the detail view reads likelyCauses/careInstructions
    // straight from rawOutput, same pattern as /grow-plan reading its summary.
    issue: text("issue"),
    severity: text("severity", { enum: plantDiagnosisSeverityEnum }),
    confidence: real("confidence"),
    rawOutput: jsonb("raw_output"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [tenantIsolationPolicy("plant_diagnoses", table.tenantId)],
).enableRLS();
