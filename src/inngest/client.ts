import { Inngest } from "inngest";

/**
 * Runs fully locally in dev via `npx inngest-cli dev` — no account or cloud
 * key needed, same category as Docker Postgres, unlike Stripe/Gemini which
 * genuinely need external credentials. See src/app/api/inngest/route.ts for
 * where this gets registered, and src/inngest/functions for the functions.
 */
export const inngest = new Inngest({ id: "edurnity" });
