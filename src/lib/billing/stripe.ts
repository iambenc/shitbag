import "server-only";
import Stripe from "stripe";

/**
 * Returns null when STRIPE_SECRET_KEY isn't set — no Stripe account is
 * provisioned yet. Every billing action branches on this and falls back to
 * a dev-mode simulation (see src/lib/actions/billing.ts) so the upgrade/
 * gating flow can be built and tested without live keys. Same move as
 * Postgres-via-Docker (Phase 0) and photo storage-via-local-filesystem
 * (Phase 3): drop in real credentials later with zero code changes.
 */
export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}
