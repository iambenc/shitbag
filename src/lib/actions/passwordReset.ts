"use server";

import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { eq, and, isNull, gt } from "drizzle-orm";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { users, passwordResetTokens } from "@/db/schema";

const PASSWORD_RESET_TOKEN_MINUTES = 60;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type RequestPasswordResetState = { message?: string };

/**
 * Always returns the identical message regardless of whether the email
 * matched a real account — the whole point is that a stranger submitting
 * this form learns nothing about who has an account here. That protection
 * has to cover response *timing* too, not just the response body: doing
 * real work (a hash + an INSERT) only on the "found" branch would let a
 * patient attacker distinguish registered emails by how long the request
 * takes, even though the text never differs. Both branches below do one
 * hash + one DB statement of comparable shape.
 *
 * No email provider is configured anywhere in this codebase (same
 * situation Stripe/R2 were in before their own credentials existed) — the
 * reset link is logged server-side only, mirroring startCheckoutAction's
 * `[dev-mode]` fallback. It's deliberately never returned to the client:
 * showing it conditionally in the UI would itself leak whether the email
 * existed, defeating the point of the generic response.
 */
export async function requestPasswordResetAction(
  _prevState: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const message = "If an account exists for that email, we've sent a password reset link.";
  if (!email) return { message };

  const tenant = await getCurrentTenant();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_MINUTES * 60 * 1000);

  await withTenant(tenant.id, async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));

    if (user) {
      await tx.insert(passwordResetTokens).values({ tenantId: tenant.id, userId: user.id, tokenHash, expiresAt });
      console.log(`[dev-mode] password reset link for ${email}: /reset-password/${rawToken}`);
    } else {
      // Equivalent-cost no-op on the not-found path — a real SELECT against
      // the same table and column the found-path just wrote to, not just
      // skipping straight to returning, so response timing doesn't
      // correlate with whether the email was registered.
      await tx.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    }
  });

  return { message };
}

const newPasswordSchema = z.string().min(8, "Password must be at least 8 characters");

export type ResetPasswordState = { error?: string; success?: boolean };

export async function resetPasswordAction(
  token: string,
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = newPasswordSchema.safeParse(formData.get("password"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
  }

  const tenant = await getCurrentTenant();
  const tokenHash = hashToken(token);
  // One generic message for not-found/expired/already-used — the caller
  // already possesses the token itself, so which specific reason it's
  // invalid isn't a meaningful enumeration vector, but there's no upside to
  // being more specific either.
  const invalidMessage = "This reset link is invalid or has expired.";

  const result = await withTenant(tenant.id, async (tx) => {
    // Atomic claim — a single guarded UPDATE, not a separate read-then-
    // write, which would let two concurrent submissions of the same token
    // (double-click, a retried request) both pass a "usedAt IS NULL" read
    // before either commits, redeeming the token twice. Same pattern as
    // confirmGrowingAreaProposalsAction/rejectRecommendationAction.
    const [claimed] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });
    if (!claimed) return null;

    const passwordHash = await hash(parsed.data, 12);
    await tx.update(users).set({ passwordHash }).where(eq(users.id, claimed.userId));

    // Invalidate every other outstanding token for this user — an older,
    // still-unexpired reset link from an earlier request must not remain
    // usable after this one has already succeeded.
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, claimed.userId), isNull(passwordResetTokens.usedAt)));

    return claimed.userId;
  });

  if (!result) return { error: invalidMessage };

  // Known gap, not solved here: sessions are pure JWTs (src/lib/auth.ts)
  // with no server-side revocation mechanism, so an already-issued session
  // for this user stays valid until it naturally expires — this reset does
  // NOT log out a session an attacker may already hold. Would need a
  // passwordChangedAt/session-version check in the jwt() callback, or a
  // switch to DB-backed sessions, to close.
  return { success: true };
}
