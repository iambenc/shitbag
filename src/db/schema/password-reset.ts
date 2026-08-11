import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { tenantIsolationPolicy } from "./_rls";

/**
 * Never stores the raw reset token, only a SHA-256 hash of it (see
 * passwordReset.ts) — same reasoning as not storing plaintext passwords,
 * but deliberately a fast hash rather than bcrypt: bcrypt's slow hashing
 * exists to resist brute-forcing a low-entropy, human-chosen secret, and a
 * 256-bit random token is already infeasible to brute-force regardless of
 * hash speed. `tokenHash` is globally unique (not per-tenant) — the lookup
 * happens before we know which tenant a token belongs to, and collision
 * risk across tenants is cryptographically negligible at this size anyway.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Null = still redeemable. Set on successful use, and also on every
    // sibling token for the same user once one is redeemed — see
    // resetPasswordAction — so an older, still-valid reset link can't be
    // used after a newer request already succeeded.
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    tenantIsolationPolicy("password_reset_tokens", table.tenantId),
  ],
).enableRLS();
