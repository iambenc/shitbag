# Edurnity

A companion app for home fruit & veg gardeners — plan what to grow, when to sow it, and how to
keep a steady harvest from a windowsill to a full allotment. Multi-tenant from day one so the
product can be white-labelled to garden centres/seed suppliers later.

See [`docs/plan.md`](docs/plan.md) *(or the plan shared with you)* for the full architecture and
phased build roadmap. This repo is currently at **Phase 7**: auth, multi-tenancy, a branded
dashboard shell, the full onboarding wizard, a growing-area inventory page (`/garden`), the
free-tier core loop (calendar, shopping list, harvest log, photo journal), billing (`/upgrade`),
an AI grow-planner agent (`/grow-plan`), daily/weekly background automation — weather-driven
watering tasks, task slippage, and an auto-generated shopping list — and a plant-health photo
diagnosis agent (`/plant-health`) with a report button on shared journal photos. Stripe and
Gemini are both wired up for real but run in dev-mode simulations until real credentials are
added (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY` in
`.env.local`); weather (Open-Meteo) needs no credentials and always calls the real API unless a
test explicitly overrides it.

## Stack

Next.js (App Router, TypeScript) · Postgres + Drizzle ORM · Auth.js v5 (credentials) ·
Postgres row-level security for tenant isolation · Tailwind CSS.

## Local setup

1. **Start Postgres** (Docker, mapped to port 5434 to avoid clashing with any local Postgres on
   5432/5433):

   ```bash
   docker compose up -d
   ```

   This also creates a non-superuser `edurnity_app` role via `docker/initdb/01-roles.sql` — the
   app connects as this role so Postgres RLS is actually enforced (superusers bypass RLS
   unconditionally, so the app must never connect as the table-owning role).

2. **Apply the schema and harden RLS grants:**

   ```bash
   pnpm db:generate   # only needed after changing src/db/schema/*
   pnpm db:migrate     # applies src/db/migrations/*.sql
   pnpm db:harden       # grants edurnity_app DML access + FORCE ROW LEVEL SECURITY
   ```

   Note: use `pnpm db:migrate`, not `drizzle-kit push` — `push` has a bug in this drizzle-kit
   version where it silently drops the `USING`/`WITH CHECK` clauses off RLS policies (verified;
   `generate` + `migrate` produces correct SQL).

3. **Seed the platform tenant** ("Edurnity" itself, tenant-zero — every install has this tenant
   as the no-subdomain fallback):

   ```bash
   pnpm db:seed
   ```

4. **Run the app:**

   ```bash
   pnpm dev
   ```

   Visit `http://localhost:3000`. To exercise a second (white-label) tenant locally, insert a row
   into `tenants` and visit `http://<slug>.localhost:3000` — `src/proxy.ts` resolves the tenant
   from the subdomain.

5. **(Phase 5+) Run the Inngest dev server**, needed for the AI grow-planner's background job —
   this is genuine local infra (no account needed), not a stand-in:

   ```bash
   npx inngest-cli dev -u http://localhost:3000/api/inngest
   ```

   `INNGEST_DEV=1` in `.env.local` tells the SDK to expect this local dev server instead of a
   production signing key.

## Multi-tenancy model

Shared database, `tenant_id` row-scoping, enforced two ways:
- App code must go through `withTenant(tenantId, fn)` ([`src/lib/tenant/withTenant.ts`](src/lib/tenant/withTenant.ts)),
  which sets `app.tenant_id` for the transaction.
- Postgres RLS policies (defined alongside each table in `src/db/schema/*.ts` via
  `tenantIsolationPolicy()` in `_rls.ts`) enforce the same scoping at the database level as a
  backstop against an app-layer bug — verified directly against Postgres that cross-tenant reads
  and writes are both rejected.

Tenant resolution happens in `src/proxy.ts` (subdomain/custom-domain → header hints, no DB call —
this may run on the Edge runtime) and `src/lib/tenant/resolve.ts` (the actual DB lookup, Node.js
runtime only).
