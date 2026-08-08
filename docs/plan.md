# Edurnity — Gardening Companion App: Architecture & Build Plan

## Context

This is a greenfield build (empty repo, no git history) for a companion app for home fruit/veg gardeners. The full functional spec spans onboarding, a swipe-based preference UI, plot/equipment inventory, an AI "grow planner" agent that turns a user's setup into crop recommendations and a task calendar, weather-reactive task automation, a second AI "plant health" agent for photo diagnosis, a free vs paid subscription tier, and — critically — multi-tenancy from day one so the product can later be white-labelled and licensed to garden centres/seed suppliers. Confirmed with the user: responsive web app (not native mobile) for v1, TypeScript throughout, no infra preference (defaults chosen below), and plan-first before any code is written given the scope.

Goal of this plan: lock in an architecture that makes the two hardest-to-retrofit things — multi-tenancy and pluggable AI providers — correct from Phase 0, while sequencing the rest of the build into independently demoable phases.

---

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router), TypeScript, hosted on Vercel** | One codebase for UI + API/server actions; RSC fits the dashboard/calendar; Vercel gives wildcard subdomains for free (needed for per-tenant routing) and native cron. |
| Database | **Postgres via Neon** (EU region) | Serverless Postgres with branching for preview envs; EU region chosen explicitly for UK/GDPR data residency. |
| ORM | **Drizzle ORM** | TypeScript-first, SQL-shaped, makes a mandatory tenant-scoping query wrapper easy to enforce (see §2). |
| Auth | **Auth.js (NextAuth) v5**, credentials provider, Drizzle adapter | Free, self-hosted, session/JWT carries `tenantId` — essential since garden-centre tenants bring their own user bases and per-MAU hosted auth (Clerk/Auth0) gets expensive at that point. |
| Payments | **Stripe** (Checkout + Customer Portal + webhooks) | Standard, handles proration/dunning; Edurnity stays merchant-of-record for all tenants in v1 (no Stripe Connect yet — see open questions). |
| Object storage | **Cloudflare R2** | S3-compatible, no egress fees (matters once photo journal has real read traffic). |
| Background jobs | **Inngest** (durable step functions + native cron triggers) | AI agent calls are slow and can fail mid-way; Inngest gives retries/backoff/observability for free, and its cron trigger covers the daily weather job and weekly shopping-list job without needing Vercel Cron as a separate piece. |
| Weather | **Open-Meteo** (forecast, free, no key) + **postcodes.io** (UK postcode → lat/lng, resolved once at onboarding) | No paid weather API needed for v1; store lat/lng on the profile so daily jobs don't re-geocode. |
| AI SDK | **Vercel AI SDK (`ai` package)**, `generateObject` with Zod schemas, provider packages (`@ai-sdk/google` default) | This *is* the provider-abstraction layer — swapping providers is a config change, not a rewrite — and structured output via Zod avoids parsing free text out of LLM responses. |
| Default AI model | **Google Gemini 3.5 Flash** | Per spec; swappable per tenant (§2). |

This is a "boring, modern, serverless" stack chosen to keep ops burden low for a solo/small team while every piece has a clean upgrade path later.

---

## 2. Multi-Tenancy

**Shared database, `tenant_id` row-scoping** (not schema- or DB-per-tenant — that would add migration/connection complexity with no real benefit at this scale, and would make Edurnity's own cross-tenant admin views harder).

- Every tenant-scoped table gets a non-nullable `tenant_id` FK. All queries go through a `withTenant(db, tenantId)` wrapper — no raw unscoped queries in app code.
- **Postgres Row-Level Security** as a backstop: `SET LOCAL app.tenant_id` per request, RLS policy per tenant table, so an app-layer scoping bug still can't leak cross-tenant data.
- `tenant_id` is embedded in the session/JWT at login.
- Tenant resolved from the `Host` header in `proxy.ts` (subdomain first — `tenant.edurnity.app`; custom domains via Vercel's Domains API come in Phase 8).
- Edurnity itself is **tenant zero** — forces the tenancy model to be exercised from day one instead of retrofitted later.
- Per-tenant configurability baked in as data, not code: `TenantAIConfig` (provider/model/API key per tenant, falls back to platform Gemini key), `TenantPlan` (Stripe price, monthly amount — defaults to £5/month, currency), tenant branding (logo, colours, display name), tenant-owned `EquipmentType`/`PartnerLink` overrides.

---

## 3. Core Data Model (entities/relationships, not full SQL)

**Tenancy & identity**: `Tenant` (branding, domain, plan defaults) · `User` (tenant FK, role) · `UserProfile` (postcode, lat/lng, plot size enum, sunlight hours, household size, expertise level, indoor seedling space, hours/day + weekend hours, onboarding-complete flag).

**Billing**: `Subscription` (stripe ids, status, tier free/paid) · `TenantPlan` (per-tenant Stripe price/amount).

**Equipment/catalog**: `EquipmentType` (tenant-scoped, admin-editable, `attribute_schema` JSON describing count-only vs sized vs width/length/depth fields) · `PartnerLink` (tenant + EquipmentType → affiliate URL) · `UserEquipment` (owned items: User + EquipmentType, quantity, attributes JSON; distinct sizes modeled as separate rows, not arrays).

**Plot/growing areas — the key reconciliation**: `UserEquipment` (what you own) → `GrowingArea` (an owned item placed into the plot: type, dimensions, status `available`/`in_use`, optional link back to its source `UserEquipment`) → `Planting` (what's currently growing in a given GrowingArea). Assigning owned equipment to the plot instantiates `GrowingArea` rows; a `Planting` flips its `GrowingArea` to `in_use`, and completing/removing that planting frees it back to `available` — this is exactly the "seed tray frees up, pot marked in-use" behaviour from the spec.

**Crop reference & preferences**: `Crop` (global catalog: spacing, soil depth, UK sowing windows indoor/outdoor, days-to-harvest, feeding notes) · `UserFavoriteCrop` (swipe result, liked/disliked — disliked is useful negative signal too) · `SeedInventory` (User + Crop, quantity, expiry, source).

**AI outputs**: `GrowPlan` (one per planning run; status, provider/model used, raw JSONB snapshot) · `PlanRecommendation` (GrowPlan + Crop: reasoning, stagger/priority, estimated harvest window, `requires_purchase` flag) · `Planting` (as above, plus status sown/growing/harvested/failed).

**Tasks**: `Task` (User, optional Planting; title, explanation, `due_date`, `hard_deadline_date`, status pending/completed/missed, source ai/manual/weather, recurrence fields `recurs_every_days`/`series_id` for succession sowing) · `TaskRescheduleEvent` (audit trail for auto-slippage and weather-driven changes, rather than silently mutating `due_date`).

**Harvest & journal**: `HarvestLog` (User, Crop, optional Planting, quantity, unit, date — this is what next year's planner reads) · `PhotoJournalEntry` (User, optional Planting/GrowingArea link, storage key, visibility private/shared-within-tenant) · `PlantDiagnosis` (User, photo, diagnosis text, confidence, care instructions, raw structured output).

**Shopping lists**: `ShoppingListItem` (User; crop ref or free-text manual item; quantity, source ai/manual, needed-by date, status, optional PartnerLink).

---

## 4. AI Agent Architecture

Two agents, one shared pattern:

```ts
interface GrowPlannerAgent { generatePlan(input: GrowPlanInput): Promise<GrowPlanOutput> }
interface PlantHealthAgent { diagnose(input: PlantHealthInput): Promise<PlantDiagnosisOutput> }
```

Each resolves a per-tenant `LanguageModel` via `getModelForTenant(tenantId, agentName)` (reads `TenantAIConfig`, falls back to platform Gemini 3.5 Flash) and calls `generateObject({ model, schema, prompt })` with a Zod schema — `GrowPlanOutputSchema` (recommendations + tasks, each fully typed) and `PlantDiagnosisOutputSchema` (issue, confidence, causes, structured care steps). Structured output removes free-text parsing entirely; validate with `.safeParse` and retry-with-feedback on failure.

**Invocation is async job + polling, not blocking request/response** — both agents realistically take seconds-to-tens-of-seconds (context-heavy reasoning / image input), too slow to block a serverless request:
1. User action creates a `GrowPlan`/`PlantDiagnosis` row (`status: pending`) and fires an Inngest function.
2. Inngest step calls the agent, writes the structured result back, sets `status: complete`/`failed` (with Inngest retries before giving up).
3. Frontend polls the row's status (simple interval poll is enough at this scale).
4. **While pending, show the gardening-quotes interstitial** instead of a spinner — a static `GardeningQuote[]` constant module (no DB table needed initially) cycled on a timer, driven purely by "is this job still pending," so it covers both agents with one component.

This pattern is the single most important thing to get right early — every slow AI operation reuses it.

---

## 5. Background Jobs (Inngest cron functions)

- **Daily weather sync + task adjustment** (~06:00): fetch Open-Meteo forecast per user with a resolved lat/lng; run a deterministic rules pass (no LLM call) over `weather_sensitive` tasks to insert/suppress watering tasks, logging `TaskRescheduleEvent`.
- **Weekly shopping list generation** (Mondays): scan `PlanRecommendation.requires_purchase = true` whose sowing date is ~2 weeks out and not yet listed; create `ShoppingListItem` rows. Deterministic — the AI already decided what's needed at plan-generation time.
- **Daily task slippage**: `pending` tasks past `due_date` but before `hard_deadline_date` get bumped forward + a `TaskRescheduleEvent(reason: slipped)`; tasks past `hard_deadline_date` flip to `missed`.

---

## 6. Subscription / Billing

- Single gate: `subscription.tier === 'paid' && status === 'active'`, computed server-side, exposed via session so both server and client components branch on it consistently.
- Free tier always gets manual calendar, manual shopping list, manual harvest log, photo journal. AI-powered routes (plan generation, diagnosis, auto shopping list) check the gate and show an upgrade CTA instead when false — one shared `<UpgradeGate>` component used for both the persistent banner and inline feature gating, so the tier check isn't duplicated across the app.
- Price comes from `TenantPlan` at checkout time (defaults £5/month, configurable per tenant) — changing price is a config change, not a deploy.
- Stripe webhooks are the only writer of `Subscription` status — never trust client state for gating.

---

## 7. Phased Roadmap

Sequenced so multi-tenancy and the AI async-job pattern (the two hardest things to retrofit) land early, and every phase is independently demoable.

- **Phase 0 — Scaffold, auth, tenancy skeleton.** ✅ Done — see implementation notes below.
- **Phase 1 — Onboarding flow.** ✅ Done — see implementation notes below.
- **Phase 2 — Plot & growing-area inventory.** ✅ Done — see implementation notes below.
- **Phase 3 — Free-tier core loop.** Manual task/calendar CRUD, manual shopping list, manual harvest logging, photo journal (R2) with private/shared-within-tenant visibility, and the **dashboard's "this week's tasks" list** (completable inline, synced to the calendar). This alone is a shippable free product and validates the non-AI data model before AI layers on top.
- **Phase 4 — Billing.** Stripe Checkout/Portal, `Subscription`/`TenantPlan`, webhooks, gating middleware, upgrade banner + nav item. Ships before AI features so gating has something real to check.
- **Phase 5 — Grow-planner agent + calendar integration (hardest phase).** AI SDK provider abstraction + `TenantAIConfig`, the async job pattern (GrowPlan row + Inngest + polling + quote interstitial), Zod structured-output schema, wiring recommendations/generated tasks into the Phase 3 calendar UI (same UI, AI-populated data instead of manual).
- **Phase 6 — Weather + shopping-list automation.** Daily/weekly Inngest jobs, Open-Meteo integration, task slippage logic, auto shopping list feeding the Phase 3 UI.
- **Phase 7 — Plant-health agent + photo sharing.** Reuses the Phase 5 async-job/interstitial/provider pattern; diagnosis history against Planting/GrowingArea; photo-sharing feed within a tenant.
- **Phase 8 — White-label/tenant admin tooling.** Admin UI for branding, custom domains, tenant `EquipmentType`/`PartnerLink` management, per-tenant AI provider config, per-tenant Stripe price config — all exposing config tables that already exist from Phase 0 onward, not new data-model work.

---

## 8. Open Questions to Resolve Alongside Early Phases

These don't block starting Phase 0, but need answers before the phases that depend on them:

- **UK crop/sowing reference data source** (needed for Phase 1 `Crop` catalog and Phase 5 planner accuracy) — RHS data, another gardening-association source, or manual curation? This is the most labour-intensive non-code task; worth starting in parallel with Phase 0–2 engineering.
- **"Most popular UK fruit/veg" list** for the swipe UI — same data-sourcing question, smaller scope.
- **Affiliate/partner link programme** for equipment recommendations (Phase 1/8) — real affiliate integration (e.g. Amazon Associates, direct garden-centre deals) or placeholder links initially? Affects whether `PartnerLink` needs click/commission tracking fields now or later.
- **Photo-sharing moderation** (Phase 7) — recommend scoping first release to opt-in sharing + a report button + manual tenant-admin review queue, rather than automated moderation.
- **AI cost/abuse control** (Phase 5) — simple rate limit on plan regeneration/diagnosis requests per user per week, to avoid unbounded Gemini spend.
- **Succession-sowing task-series UX** (Phase 5) — can a user edit/cancel a single occurrence vs the whole recurring series? Needed before finalizing the `series_id` schema behaviour.
- **Stripe merchant-of-record confirmation** — Edurnity stays the seller of record for all tenants in v1 (no Stripe Connect); flag now so Phase 8 doesn't silently grow into a payments-splitting project.

---

## Verification Approach

- Each phase: build against seed data, exercise the flow end-to-end in the browser (start the dev server and click through the golden path, not just type-check), and for Phase 5/7 specifically, verify the Zod schema rejection/retry path by temporarily forcing a malformed model response.
- No automated test suite is prescribed here at the plan level — recommend adding integration tests per phase as it's built (e.g. tenant-scoping query wrapper, task-slippage job logic, Zod schema parsing) rather than deferring testing to the end. Playwright is already available as a devDependency for browser-driven checks.

---

## Phase 0 — Implementation Notes

Deviated from the original plan in two places, both because Neon isn't provisioned yet:

- **Local Postgres runs in Docker** (`docker-compose.yml`), not Neon, for now. Mapped to host port
  **5434** — ports 5432 and 5433 were both already in use locally by unrelated Postgres instances.
  Swap in a Neon connection string in `.env.local` when ready to move off Docker; nothing else
  changes.
- **Two DB roles, not one.** `edurnity` (superuser, owns tables, runs migrations) and
  `edurnity_app` (no special privileges, what the running app actually connects as). This matters
  because **Postgres superusers bypass RLS unconditionally** — if the app connected as the owning
  role, every RLS policy in this project would silently be a no-op. `pnpm db:harden` grants the
  app role DML access and applies `FORCE ROW LEVEL SECURITY` after each migration. On Neon, use
  an equivalent non-superuser role for `DATABASE_URL` and keep `DATABASE_URL_OWNER` for migrations.

Two real bugs found and fixed while building this, worth knowing about before continuing:

1. **`drizzle-kit push` drops RLS policy clauses.** Pushing a schema with `pgPolicy(...,
   { using, withCheck })` directly against a live DB creates the policy with `USING`/`WITH CHECK`
   both `NULL` — silently not enforcing anything. `drizzle-kit generate` (migration-file mode)
   produces correct SQL for the same schema. **Use `pnpm db:generate` + `pnpm db:migrate`, never
   `drizzle-kit push`, for this project.**
2. **`middleware.ts` at the repo root is silently ignored in a `src/` layout.** Next.js expects
   `src/middleware.ts` (or, as of Next 16, `src/proxy.ts` — the `middleware` file convention is
   deprecated in favor of `proxy`, with the exported function renamed from `middleware` to
   `proxy`). The file existed and looked correct for a while with no visible error; only the
   subdomain-routing behavior quietly never ran.

Also found and fixed: the initial `authorize()` callback in `src/lib/auth.ts` ran its user lookup
through the plain (unscoped) `db` client instead of `withTenant()`. Since RLS was working
correctly, this meant login queries returned zero rows unconditionally (safe, but broken) rather
than an actual cross-tenant leak — a good example of RLS doing its job even against the app's own
code.

Verified end-to-end with Playwright (against two tenants — the seeded platform tenant and a
temporary second tenant on a `.localhost` subdomain) before removing the test tenant: signup,
login, logout, wrong-password rejection, unauthenticated-redirect, per-tenant branding via
subdomain, cross-tenant credential rejection, and same-email-different-tenant signup all pass.
Also verified directly against Postgres (bypassing the app entirely) that RLS rejects both
cross-tenant reads and cross-tenant writes.

Two follow-up fixes landed after a user report of "7 console issues" on first load: `auth()` and
`getCurrentTenant()` were each called once in `RootLayout` and again in the page component for
every request with no per-request memoization, so a stale/invalid session cookie logged its
decode error twice; both are now wrapped in React's `cache()`. Separately, `suppressHydrationWarning`
was added to `<body>` since browser extensions (e.g. Grammarly) inject DOM attributes before
hydration that React otherwise flags as a mismatch — not an app bug.

---

## Phase 1 — Implementation Notes

Built onboarding as six routes under `/onboarding/*` (`location`, `crops`, `plot`, `equipment`,
`seeds`, `experience`), each persisting immediately via a server action rather than one final
submit — a user who abandons partway through keeps whatever they already entered. `src/app/
dashboard/page.tsx` now redirects to `/onboarding/location` whenever `userProfiles
.onboardingCompletedAt` is null; finishing the `experience` step sets that timestamp and redirects
to `/dashboard`.

New schema: `crops` (global, not tenant-scoped — same crop catalog for every tenant) plus
tenant-scoped `userFavoriteCrops`, `seedInventory`, `equipmentTypes`, `partnerLinks`,
`userEquipment`, all following the same RLS pattern as Phase 0 (`tenantIsolationPolicy()` +
`.enableRLS()`), verified with the same direct-Postgres cross-tenant read/write check used in
Phase 0. Seed data lives in `src/db/seed-data/{crops,equipment}.ts` (25 crops, 6 equipment types +
placeholder `example.com` partner links) and is applied idempotently by `pnpm db:seed`.

"Recommended equipment" (spec: unowned items get linked to partner sites) is deliberately **not**
a stored table — the equipment step computes it live as `equipmentTypes` minus whatever the user
has rows for, joined to `partnerLinks`, so it can never go stale.

The crop swipe deck (`src/app/onboarding/crops/CropSwipeDeck.tsx`) uses `framer-motion`
(new dependency) for drag-to-swipe with `onDragEnd` threshold detection, plus explicit ✕/♥ buttons
— both for accessibility and because dragging is impractical to drive from Playwright, so the
button path is what's actually exercised in the e2e check.

One real bug caught during Playwright verification, not a framework quirk this time: the
`ExperienceForm`'s expertise-level radio inputs were styled `sr-only` (visually hidden, relying on
label-click) while the equivalent `PlotForm` radios were left visible — an unintentional
inconsistency, and it also meant Playwright couldn't click the input directly (the label
intercepted the click). Fixed by making both steps consistent (visible radio + label), which is
also simply the more standard pattern.

Verified end-to-end with Playwright: signup → lands in onboarding (not dashboard) → postcode
geocode via postcodes.io → swipe deck (via buttons) exhausts and advances → plot form → equipment
step (count/sized/dimensions inputs all exercised, "you might also want" list confirmed showing
unpicked types with partner links) → seeds step skipped → experience step finishes onboarding →
dashboard shows the completed-profile summary with correct plot size, expertise, and favourite
crop count → dashboard no longer redirects on a second visit → equipment step correctly reloads
previously saved quantities on revisit.

---

## Phase 2 — Implementation Notes

New `growingAreas` table (tenant-scoped, same RLS pattern, verified with the same direct-Postgres
cross-tenant read/write check) with **no `quantity` column** — deliberately different from
`userEquipment`, since each row represents one physical, independently-trackable unit (needed so
a future `Planting` can flip exactly one pot to `in_use` without affecting its siblings). `type`
covers `seed_tray`/`pot`/`planter`/`raised_bed`/`bed` — seed trays are included (not just pots)
because the original spec's own worked example of the in_use/available lifecycle is "seedlings
move from a seed tray to pots, the seed tray frees up and the pot is marked in-use." Every row
created in this phase has `status: "available"` — there's no `Planting` entity yet to ever set
`in_use`, but the column and the delete-prefers-`available`-over-`in_use` logic in
`syncGrowingAreasAction` are already correct for when one exists, so nothing needs revisiting.

New page `/garden` reuses Phase 1's owned-equipment data directly rather than asking the user to
re-enter anything: one stepper per `userEquipment` row (excluding `watering-can`, which isn't
growing space) showing "N placed of {quantity owned}". Moving it calls
`syncGrowingAreasAction(userEquipmentId, desiredCount)`
(`src/lib/actions/garden/syncGrowingAreas.ts`), which re-clamps the desired count server-side
rather than trusting the client, and inserts/deletes individual `growingAreas` rows to match.
The read-only visualization above the steppers is deliberately *not* a separate data source — it's
derived client-side from the same `placedCount` per equipment row (rendered as N repeated cards),
so there's only one code path that can go stale, not two drifting in parallel. Width/length rows
render a proportionally-scaled rectangle (capped/floored in px) for a rough sense of relative
size; pot/seed-tray cards just show the label.

The equipment-slug → growing-area-type mapping (`src/lib/garden/equipmentMapping.ts`) is shared
between the server action and the page query rather than duplicated, since both need to agree on
exactly which equipment types are "placeable."

Verified end-to-end with Playwright: complete onboarding owning 2 pots (20cm) and 1 raised bed
(100×50×30cm) → `/garden` shows "You own 2" / "You own 1" and an empty "nothing placed yet" state
→ clicking + twice on pots reaches "2 placed" and the + button correctly disables at the owned
limit → clicking + on the raised bed shows a scaled card alongside the two pot cards → clicking –
removes one pot card → reloading the page confirms the placed counts and visualization persisted
correctly from the database, not just client state.
