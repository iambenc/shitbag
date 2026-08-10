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
- **Phase 3 — Free-tier core loop.** ✅ Done — see implementation notes below.
- **Phase 4 — Billing.** ✅ Done — see implementation notes below.
- **Phase 5 — Grow-planner agent + calendar integration (hardest phase).** ✅ Done — see implementation notes below.
- **Phase 6 — Weather + shopping-list automation.** ✅ Done — see implementation notes below.
- **Phase 7 — Plant-health agent + photo sharing.** ✅ Done — see implementation notes below.
- **Phase 8 — White-label/tenant admin tooling.** ✅ Done — see implementation notes below.

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

---

## Phase 3 — Implementation Notes

Four new tables (`tasks`, `shoppingListItems`, `harvestLog`, `photoJournalEntries`), same RLS
pattern as every table so far, spot-checked directly against Postgres on `tasks`. `shoppingListItems`
adds a Postgres `CHECK` constraint (`(crop_id is not null) <> (free_text is not null)`) so "exactly
one of catalog crop or free-text item" is enforced at the database level, not just in Zod — an
extra bit of defense-in-depth consistent with how RLS itself is used as a backstop everywhere else
in this project, not merely an app-layer convention.

**Photo storage** (`src/lib/storage/`) is a small `PhotoStorage` interface with a local-filesystem
implementation (`public/uploads/<tenant>/<user>/<uuid>.<ext>`, gitignored) standing in for R2, the
same move made for Postgres in Phase 0 (Docker now, Neon later) — swapping in R2 is a new
implementation of the same interface plus an env var, not an app-code change.

A `requireSessionAndTenant()` helper used to live under `src/lib/actions/onboarding/shared.ts`;
now that four more feature areas need the identical "who is this and which tenant" check, it moved
to `src/lib/actions/shared.ts` and every action file (onboarding, garden, and the four new ones)
imports it from there.

**Real bug found by Playwright, not a framework quirk**: every "add" action (task, shopping item,
harvest) followed the same optimistic-update shape — insert a client-side placeholder row with an
id like `optimistic-${Date.now()}` immediately, before the server confirmed anything. The very
next interaction with that row (toggling complete, marking purchased, deleting) sent that fake
string to Postgres as a `uuid` parameter and got a hard `22P02 invalid input syntax for type uuid`
500 error — caught because the e2e check inspected console/page errors, not just DOM assertions
that happened to still look right (the optimistic *removal* on delete, for instance, made the item
disappear from the UI regardless of whether the server call underneath actually succeeded, so a
shallower test would have passed anyway). Fixed by having every create action `.returning()` the
real inserted row and only adding it to client state once the real id comes back, instead of ever
inventing one — removed the placeholder-id pattern everywhere rather than special-casing it. The
same investigation surfaced a second bug in the photo journal: it *did* correctly call
`router.refresh()` after mutations, but `JournalView`'s `useState(myPhotos)` only consumes its
prop on first mount, so a refresh alone never actually updated the visible list — fixed by having
`uploadPhotoAction` return the created photo directly (same fix shape as the others) and dropping
`router.refresh()` entirely in favour of local state kept in sync by the actions' return values.
Confirmed the fix is real (not just a client-side illusion) by comparing final Postgres row counts
and values against what the UI displayed at the end of the Playwright run.

Verified end-to-end with Playwright: add a task on `/calendar` for today → appears there and in
the dashboard "This week" list → mark complete from the dashboard → shows completed back on
`/calendar` → delete it. Add a catalog-based and a free-text shopping item → mark one purchased →
delete the other. Log a harvest. Upload a photo as private → visible only under "My Photos";
upload a second as shared → appears in both "My Photos" and "Shared in {tenant}". 13/13 checks
pass, and a direct Postgres query afterward confirms row counts/values match exactly what the UI
showed.

---

## Phase 4 — Implementation Notes

No Stripe account/keys exist in this environment (confirmed with the user before building). Built
the real integration against the Stripe Node SDK's documented API — `src/lib/actions/billing.ts`
(Checkout Session + Billing Portal Session creation) and `src/app/api/webhooks/stripe/route.ts`
(signature-verified webhook handling `checkout.session.completed` /
`customer.subscription.updated` / `.deleted`) — but it's **untested against a live account**; that's
a follow-up once test keys exist. `src/lib/billing/stripe.ts`'s `getStripeClient()` returns `null`
when `STRIPE_SECRET_KEY` is unset, and both billing actions branch on that to a dev-mode path that
directly writes the `subscriptions` row and logs `[dev-mode] simulating ...` — same stand-in shape
as Docker Postgres (Phase 0) and local photo storage (Phase 3). This is what Playwright actually
exercises below.

New `subscriptions` table (tenant-scoped, RLS, spot-checked directly against Postgres like every
table so far) — one row per user, created at signup alongside `userProfiles`. Deliberately **not**
embedding tier in the session/JWT as the original architecture doc suggested: a JWT doesn't refresh
mid-session when the DB changes, so a user who just paid would still read as free until their token
rotated — a real staleness bug for a paying customer. Instead `getSubscription()`
(`src/lib/billing/subscription.ts`) is fetched fresh per request, matching how `userProfile` and
tenant are already handled everywhere else in this app.

**Real bug, caught by Playwright, not a framework quirk**: right after a successful dev-mode
subscribe/cancel, the `/upgrade` page's own content updated correctly, but the header nav's
"Upgrade" link (rendered by the shared root layout) kept showing the pre-mutation state — even
immediately after a hard page reload in one debugging pass, though it resolved on a subsequent
navigation. Root cause: Next.js's client-side Router Cache treats a layout segment shared between
the page a Server Action redirects *from* and *to* as unchanged unless explicitly told otherwise,
so mutating data a layout depends on doesn't invalidate what the client has already cached for it.
Fixed by calling `revalidatePath("/", "layout")` in both billing actions before their dev-mode
`redirect()`. Caught by an isolated debug script that dumped page content immediately after each
step — the original Playwright run's assertions were *also* subtly broken in a related way (see
below) which had been masking how much of this was really fixed.

**Second issue, this time in the test itself**: `/upgrade`'s dev-mode actions redirect back to
`/upgrade` — the same URL. `page.waitForURL(/\/upgrade/)` resolves immediately in that case (the
current URL already matches), so the check that followed ran before the POST had actually
completed, not after. Replaced with waiting on the actual post-mutation content
(`page.locator(...).waitFor(...)`) instead of the URL. Worth remembering for any future same-URL
redirect flow in this codebase.

Verified end-to-end with Playwright (dev-mode path): sign up and complete onboarding → dashboard
shows the upgrade banner and header shows "Upgrade" → `/upgrade` shows "£5.00/month" (from
`tenantPlans`, unchanged since Phase 0) → Subscribe → "You're subscribed" + "Manage subscription"
→ banner and header link both gone, confirmed via a fresh dashboard load → Manage subscription
(dev-mode cancel) → back to "Subscribe" → banner and header link both reappear. 11/11 checks pass,
and a direct Postgres query confirms the final row (`tier: free`) matches the UI's end state.

---

## Phase 5 — Implementation Notes

No Gemini key exists in this environment (confirmed with the user before building, same as
Stripe in Phase 4). `src/lib/ai/provider.ts`'s `getModelForTenant()` resolves a `TenantAIConfig`
row, then `GOOGLE_GENERATIVE_AI_API_KEY`, returning `null` if neither is set — the trigger for
`src/lib/ai/agents/growPlanner.ts`'s mock path, which produces structurally valid, plausible
output (harvest dates staggered by recommendation index so gluts are avoided in mock output too,
`requiresPurchase` computed from real `seedInventory` presence, reasoning text that clearly labels
itself "[Mock plan]") from the same inputs the real `generateObject` prompt would use, so the
whole pipeline is genuinely exercised end to end. The real Gemini call path is written against the
AI SDK's documented `generateObject` API (kept over the newer `generateText({ output: Output.object(...) })`
form this SDK version's types mark as the replacement — deprecated but still exported and
functional, and simpler/more stable to write against untested) but is **untested against a live
key** in this session, same caveat as Phase 4's Stripe integration.

**Inngest runs for real, not simulated** — `npx inngest-cli dev` needs no account, so unlike
Stripe/Gemini this is genuine local infra (same category as Docker Postgres). Needed
`INNGEST_DEV=1` in `.env.local` (undocumented in the error message's absence — "In cloud mode but
no signing key found" only makes sense once you know the SDK defaults to assuming a production
deployment) and a Next.js dev server restart to pick it up, since Next only reads `.env.local` at
startup.

New tables `growPlans` and `planRecommendations` (RLS-verified same as every table so far).
`tasks` gained two additive nullable columns flagged as acceptable back in the Phase 3 notes —
`source` (`manual`/`ai`) and `hardDeadlineDate` — which is what lets AI-generated tasks appear on
the existing `/calendar` and dashboard "This week" UI with zero changes to their data-fetching
logic, just a small "AI" badge and deadline line added to the existing rendering.

**Real bug, the most consequential one found so far**: `getModelForTenant()` originally used the
plain unscoped `db` client against `tenantAIConfigs` — reasoned at the time as "resolving the
model is infrastructure, not user data" (see the plan's original wording). This is row-level-
secured like every tenant table, and outside `withTenant()` it should just filter to zero rows,
not error — except it didn't. On a **pooled** Postgres connection, once *any* transaction has done
`SET LOCAL app.tenant_id = ...` (which every `withTenant()` call does), Postgres permanently
registers a placeholder for that custom GUC on that physical connection; after the transaction
ends, `current_setting('app.tenant_id', true)` on a later unscoped query over that same pooled
connection returns `''` (empty string) rather than `NULL` — and the RLS policy's `::uuid` cast on
that empty string throws a hard `invalid input syntax for type uuid` error instead of silently
matching nothing. Reproduced directly against Postgres outside the app entirely (a transaction
setting the GUC, then five plain queries afterward all seeing `''`) to confirm it wasn't
app-specific. Every other unscoped `db` usage in the codebase was audited and found to only ever
query the deliberately-global `crops` table (not RLS-protected) — this was the one place the
existing "always use `withTenant()` for tenant-scoped tables" rule (stated explicitly in
`withTenant.ts`'s own doc comment since Phase 0) got violated. Fixed by routing the query through
`withTenant()` like everything else; no exceptions to that rule going forward, including for
"infrastructure" reads.

Verified end-to-end with Playwright (mock-provider path, real Inngest job): sign up, complete
onboarding (liking 3 crops, disliking the rest, owning one seed packet) → free user sees a
paywall on `/grow-plan` → subscribe (Phase 4 dev-mode) → "Generate my grow plan" → interstitial
with a cycling quote while polling → resolves to 3 recommendations (correctly excluding every
disliked crop) with reasoning, harvest-date estimates, and a shopping-list badge on the one
requiring purchase → `/calendar` shows the 7 generated tasks with the AI badge → dashboard
renders cleanly. 9/9 checks pass, and a direct Postgres query confirms exactly one `complete`
grow plan with 3 recommendations and 7 AI-sourced tasks — matching the UI, not just plausible.

---

## Phase 6 — Implementation Notes

**Gating split** (documented up front in the plan, not discovered mid-build): the spec places
weather-driven task adjustment under the subscriber section, so `dailyJobsFn`'s weather step only
runs for paid users; task slippage ("pushed back... until completed or past the last date") isn't
tied to subscription anywhere in the spec and reads as general calendar hygiene, so it runs for
everyone — a free user's manual tasks slip forward exactly like an AI-generated one would. The
weekly shopping-list job needed no explicit tier check at all: it only ever finds work via
`planRecommendations.requiresPurchase`, which only exist for users who've generated a grow plan,
already paid-gated since Phase 5.

New `taskRescheduleEvents` table (RLS-verified, audit trail only — no UI reads it, the spec never
asks users to see reschedule history). `tasks` gained `cropId` (nullable, set by Phase 5's
Inngest function for AI-generated tasks so this phase's weekly job can find "the sow task for this
crop" without a link table), plus `"missed"` added to its status enum and `"weather"` to its
source enum. `shoppingListItems` gained a `source` column mirroring `tasks.source`, for the same
"AI" badge treatment already used on `/calendar`.

**Weather is genuinely real** (Open-Meteo, free, no key) — but real weather can't be asserted on
in a test, so `getForecast()` takes an optional per-call `forceScenario` override, threaded from
`POST /api/dev/run-jobs`'s request body through the Inngest event into that single job run. This
is a different shape from the Stripe/Gemini dev-mode fallbacks (which trigger on the *absence* of
credentials): weather needs no credentials at all, so the override is explicit and per-call rather
than a standing environment default — letting the Playwright run exercise both the hot/dry and
rainy branches in the same test run without restarting the dev server between them, which an
env-var-only approach would have required (as `INNGEST_DEV` did in Phase 5).

Both new Inngest functions accept a `dev/run-jobs` event alongside their real cron trigger
(`0 6 * * *` / `0 6 * * 1`) — Inngest supports multiple triggers per function — so
`/api/dev/run-jobs` (session-gated, not public) can fire either job on demand instead of waiting
for the schedule. Flagged in its own comment as a temporary stand-in for real admin tooling
(Phase 8) or just relying on cron in a real deployment.

Both jobs iterate tenants via the unscoped `tenants` table (not RLS-protected, same as
`getCurrentTenant()`) and do all per-tenant work through `withTenant()` for every other table —
deliberately avoiding the exact class of bug Phase 5 cost real debugging time on (an unscoped
query against an RLS-protected table silently misbehaving on a pooled connection). No new bugs of
that kind surfaced this phase, which is what following the rule consistently is supposed to buy.

Verified end-to-end with Playwright, using the real Inngest dev server (not simulated): sign up,
onboard, subscribe, generate a grow plan → trigger the daily job with `hot_dry` → a "Water your
plants today" task appears on `/calendar` → trigger again with `rainy` → that task is gone →
trigger the weekly job → an AI-badged shopping-list item appears on `/shopping-list` → backdate an
AI task's due date 5 days via direct Postgres access, trigger the daily job → it slips to today
with a logged `taskRescheduleEvents` row → backdate it again with a past `hardDeadlineDate`,
trigger once more → it flips to `missed`. 8/8 checks pass, and a direct Postgres query afterward
confirms the exact counts (0 lingering weather tasks, 1 missed task, 3 AI shopping-list items, 1
reschedule event with the correct old/new dates) match what the UI showed.

---

## Phase 7 — Implementation Notes

Second AI agent, reusing every pattern Phase 5 established rather than inventing new ones: same
`getModelForTenant()` resolution (`"plant_health"` was already a valid `AgentName` since Phase 5's
provider typing), same mock/real split in the agent module, same Inngest gather-context/call-agent/
persist-results/mark-failed shape, same paid-gated redirect-based server action shape. No Gemini
key exists in this environment (same as Phases 4/5), so the real path — a multi-modal
`generateObject` call with the image as a `FilePart` (`{ type: "file", mediaType, data: Buffer }`;
the older `ImagePart` shape is deprecated in this AI SDK version) — is written but untested against
a live key, same caveat as before. The mock path picks deterministically from three canned,
clearly-labelled diagnoses (keyed off the uploaded image's byte length, not random), one of which
intentionally has an empty `likelyCauses` array to model a genuine "no issues detected" result —
the UI only renders that section when non-empty, which is correct behaviour, not a bug (it tripped
up the first draft of the Playwright check, not the app).

**`PhotoStorage` gained `readBuffer(key)`** — a real `fs.readFile` for local storage — because the
image has to reach the model as bytes; a `localhost` URL isn't reachable from an external API.
Swapping to R2 later means implementing `readBuffer` against R2's GET, not an app-code change,
matching how `upload`/`delete` were already designed.

New tables `plantDiagnoses` and `photoReports` (RLS-verified against Postgres, both directions, for
both tables — `photoReports` wasn't explicitly called out in the plan's own verification list but
got the same spot-check as every other new tenant-scoped table on the strength of the standing
rule, not because anything suggested it needed extra scrutiny). `photoReports` is storage only, no
UI reads it yet — same shape as `taskRescheduleEvents` from Phase 6, an audit trail waiting on
Phase 8's tenant-admin review queue.

**Interstitial generalized** from `GrowPlanInterstitial` (hardcoded to the grow-plan status
endpoint) to `JobInterstitial` (`statusUrl` + `message` props), used by both `/grow-plan` and
`/plant-health` — the old component was deleted rather than left as unused dead code, since nothing
still referenced it.

**Explicit scope-out, unchanged from the plan**: no `Planting`/`GrowingArea` linkage for diagnoses
— a diagnosis links to the photo and the user, not a specific plant instance, same reasoning as
Phase 5's deferral of that entity. The report button stores a reason and nothing else; there is
still no admin queue that reads `photoReports` (Phase 8).

Verified end-to-end with Playwright against the real local Inngest dev server (not simulated): free
user sees the `/plant-health` paywall → subscribes (Phase 4 dev-mode) → uploads a photo → job
resolves in well under a second (mock path, no network call) → diagnosis card renders with
issue/severity/care instructions → from `/journal`, clicking "Diagnose" on an existing photo
produces a second diagnosis, history shows both → sharing a photo and switching to a second signed-
up user, that user reports the shared photo from the "Shared in {tenant}" tab and sees the
"Reported" acknowledgement. 14/14 checks pass; a direct Postgres query afterward confirms exactly
one `photo_reports` row (correct reporter, reason, and tenant) and exactly two `complete`
`plant_diagnoses` rows for the first user — matching the UI, not just plausible. `tsc --noEmit` and
`eslint` both clean. Test users, uploaded files, and the ad-hoc `e2e-check.mjs` script were all
removed after verification.

---

## Phase 8 — Implementation Notes

The last phase on the original roadmap, and the smallest in new data-model terms — every table
this phase exposes (`tenants`, `tenantPlans`, `tenantAIConfigs`, `equipmentTypes`/`partnerLinks`,
`photoReports`) already existed. What this phase actually added was: the first role gate in the
app, three correctness fixes the admin surface would have otherwise silently exposed, and real
encryption for a column that had been misleadingly named since Phase 0.

**`role` had existed since Phase 0 and flowed all the way to the session, but nothing had ever
checked it.** `requireTenantAdmin()` (`src/lib/actions/shared.ts`) is the first place that does,
and deliberately checks *two* things, not one: `session.user.role === "tenant_admin"` AND
`session.user.tenantId === (await getCurrentTenant()).id`. Every other action in the app has only
ever needed one or the other, because RLS fails closed on a row-scoped mismatch (a stale-session
read/update against the wrong tenant just matches zero rows — safe, if silently so). Admin actions
are the first place doing INSERT-style config mutations with no existing row's `tenant_id` to fail
closed against, so a Host-header/session mismatch wouldn't have been caught by RLS at all. No
self-serve promotion to `tenant_admin` exists, on purpose — the only way is a direct
`UPDATE users SET role = 'tenant_admin' WHERE email = ...`, same category as the manual Postgres
role setup from Phase 0. `platform_admin` (also in the enum since Phase 0) stays fully unused —
this phase is tenant-scoped admin tooling, not a cross-tenant platform console.

**Two latent correctness bugs, found by asking "what happens if the admin UI inserts a second row"
rather than by anything failing at runtime**: `tenantPlans` and `tenantAIConfigs` had no unique
constraint per tenant (or per tenant+agent), and `billing.ts`'s `startCheckoutAction` read the
"first row" of an *unordered* select — non-deterministic the moment a second row could exist.
Fixed with `unique("tenant_plans_tenant_unique")` and
`unique("tenant_ai_configs_tenant_agent_unique")`, both migrated cleanly (a real owner-role
duplicate-row check beforehand found nothing to conflict, as expected — Postgres would have
refused the migration outright otherwise, so this was hygiene, not a safety net), with every write
going through `.onConflictDoUpdate()` instead of a plain insert.

**`tenantAIConfigs.apiKeyEncrypted` had been named as if encrypted since Phase 0 but was read and
stored as plaintext** — harmless while nothing ever wrote to it, but this phase is exactly what
starts writing tenant-supplied keys into it. New `src/lib/security/secretBox.ts`
(`encryptSecret`/`decryptSecret`, AES-256-GCM via Node's built-in `crypto`, keyed by a
`CONFIG_ENCRYPTION_KEY` env var generated once for `.env.local`). This isn't treated like the
Stripe/Gemini dev-mode fallbacks (those are the *platform's own* single credential, never
displayed or edited through a UI); a tenant admin's key lives in the same shared Postgres database
as every tenant's data, so it gets encrypted at rest for real, not caveated. `getModelForTenant()`
fails soft on a missing key or a decrypt error (falls through to the platform key, same as "no
tenant key configured"), not hard — a misconfigured `CONFIG_ENCRYPTION_KEY` shouldn't take down
every tenant's AI features. The admin UI never echoes a decrypted key back — only
configured/not-configured, with a blank field meaning "leave unchanged" and an explicit "clear"
control to remove one. Required a dev-server restart to pick up the new env var, same lesson as
`INNGEST_DEV` in Phase 5.

**Photo-report resolution forces the photo back to `private` rather than hard-deleting it** —
`photoReports` gained a `status` enum (`pending`/`dismissed`/`actioned`, not just two states, so
"no violation found" and "photo unshared" stay distinguishable in the admin's history) plus
`resolvedAt`/`resolvedByUserId` (the latter `onDelete: "set null"`, an audit pointer rather than an
ownership relationship, matching `taskRescheduleEvents`'s reasoning). A hard delete was considered
and rejected: `photoJournalEntries` cascades to `plantDiagnoses`, so deleting a photo over one
bad-faith report would have destroyed the owner's diagnosis history as collateral damage — a
strictly bigger loss than the actual problem (an unwanted photo in the shared feed). "Unshare
photo" reuses the same visibility update `setPhotoVisibilityAction` already does for an owner
un-sharing their own photo, just without the ownership filter, and is batched by
`photoJournalEntryId` — every pending report against that photo flips to `actioned` at once, not
just the row clicked, since the thing in dispute (the photo's visibility) is now settled for every
reporter simultaneously. "Dismiss" stays strictly per-report.

`tenants.logoUrl` had zero consumers since Phase 0 — added a small `<img>` render in
`src/app/layout.tsx`'s header (falling back to the 🌱 emoji when unset) so the branding form has
something real to change, not just a DB write with no visible effect.

Verified end-to-end with Playwright (20/20 checks): signed up a user, promoted them to
`tenant_admin` via direct Postgres (confirming the deliberate no-self-serve-UI decision is real,
not just documented), logged out and back in (the JWT only picks up a new role on a fresh sign-in)
→ nav shows "Admin" → branding/billing/AI/equipment/reports sections all exercised through the
real UI, each cross-checked directly against Postgres rather than trusted at face value — including
confirming the stored `api_key_encrypted` value is never the plaintext string typed into the form,
that an equipment-type delete warning shows a real (non-placeholder) usage count, that "Unshare"
genuinely batches every pending report against a photo rather than just the one clicked, and that
an owner's `plantDiagnoses` row survives a report resolution untouched. `tsc --noEmit` and `eslint`
both clean. Two real bugs surfaced and fixed during this phase's own build (a `"use server"` file
exporting a non-function constant, caught immediately by Next's own build-time check; a test race
where a pre-existing "Diagnose" button on an older photo got clicked before a newly-uploaded
photo's button existed, fixed in the test, not the app) — both documented here since the second
one is exactly the kind of "looks like an app bug at first glance" mistake worth a record of, even
though it wasn't one. This phase mutates the one shared dev tenant's own config rather than a
disposable per-test tenant, so — a first for this project's verification approach — the test
captured the tenant's branding/billing state up front and restored it in a `finally` block instead
of just deleting rows; confirmed by direct Postgres query afterward that `tenants` and
`tenant_plans` were back to their exact pre-test values. Test users, the extra equipment type, the
now-empty `tenant_ai_configs` row, and the ad-hoc `e2e-check.mjs` script were all removed after
verification.

---

## UI/UX & Accessibility Pass — "Botanical" palette

Outside the original 8-phase roadmap: a real audit (not a stylistic opinion pass) requested after
noticing the app "looked dark" — that turned out to be a genuine CSS bug (see the dark-mode
`globals.css` fix, same session, prior to this note) — followed by a broader assessment. Computed
WCAG 2.1 contrast ratios for every color pairing actually in use, grepped for repeated patterns,
and screenshotted key pages before touching anything.

**Real accessibility defects fixed**, not stylistic opinions:
- The codebase's "muted text" pattern (`text-[#1f2a1f]` at 50/60/70/80% opacity, 92 instances
  across 35+ files with no evident system) had two tiers that **failed WCAG AA's 4.5:1 minimum**:
  50% opacity measured 3.02:1, 60% measured 4.02:1. Consolidated all four tiers into a single new
  solid token, `--text-muted: #4b5a4d` (verified 6.89:1 on the cream background, 7.32:1 on white
  cards) — defined in `globals.css`'s `:root` and consumed as `text-(--text-muted)`, mirroring
  exactly how `--brand-primary`/`--brand-secondary` are already consumed everywhere via Tailwind
  v4's arbitrary-value-referencing-a-CSS-var syntax. Done as a mechanical `sed` pass, not manual
  per-file edits, since it was a pure token substitution with no visual-design judgment per
  instance.
- No `:focus-visible` styling existed anywhere — keyboard focus relied entirely on the browser
  default. Added an on-brand ring in `globals.css`: `outline: 2px solid color-mix(in srgb,
  var(--brand-primary) 70%, black)`. `color-mix()` is the only place this pass reaches for it —
  considered and explicitly declined for a card-hover effect, since nothing in the audit flagged
  card hover as broken.
- Native `<input type="file">` (photo upload in `/journal` and `/plant-health`) rendered the bare
  OS file-picker button, clashing against the branded buttons next to it — restyled via Tailwind's
  `file:` variant to match. Every native checkbox/radio in the app (task-complete checkboxes,
  photo-visibility radio, onboarding plot/experience radios, admin AI-config checkboxes) gained
  `accent-(--brand-primary)` so they tint instead of rendering the browser's default blue.

**Palette** — evolves, not replaces, the existing one (it already scored well: primary `#2f6b3c`
forest green measured 6.01:1/6.38:1 on cream/white, more than adequate — a wholesale swap would
have been bad practice for its own sake):

| Token | Hex | Role | Verified contrast |
|---|---|---|---|
| Fern (primary) | `#2f6b3c` | unchanged — buttons, links, headings | 6.01:1 cream / 6.38:1 white |
| Marigold (accent) | `#e8b23d` | deepened from `#e8c34a` for a richer "harvest gold" | 7.71:1 with dark text only (1.93:1 with white — never pair with white text) |
| Terracotta (new) | `#a8512f` | clay-pot warmth; medium-severity plant-diagnosis badge | 5.41:1 with white text only (2.76:1 with dark — never use as foreground text) |
| Soil (new) | `#4b5a4d` | `--text-muted`, see above | 6.89:1 cream / 7.32:1 white |
| Linen / white | `#faf8f2` / `#ffffff` | unchanged — background / card surfaces | — |
| Error | Tailwind `red-*` | unchanged — red is a universal convention, not reinvented | — |

Fern and Marigold stay tenant-configurable (`tenants.primaryColor`/`secondaryColor`, unchanged
mechanism, still editable per-tenant via `/admin/branding`). Terracotta and Soil are new **fixed**
platform-level tokens in `globals.css` — deliberately not tenant-configurable, since they're
structural (muted text, a severity color) rather than brand identity. Rolled out via: the
`tenants.secondaryColor` column default (migration `0009_known_sugar_man.sql`, a plain `ALTER
COLUMN ... SET DEFAULT`, no data migration needed since it only affects future inserts),
`seed.ts`'s insert value for fresh seeds, and a direct Postgres update of the one live seeded
"edurnity" tenant row (no throwaway admin account existed to drive it through `/admin/branding`
at the time, and creating one just for a single field felt like more ceremony than the change
warranted — flagged as a fine fallback in the plan itself).

**Usability gaps fixed**:
- Plant-health severity badges (`none`/`low`/`medium`/`high`) rendered identically regardless of
  severity — real gap, not cosmetic (a gardener couldn't tell urgency at a glance). Now
  differentiated: none/low get a calm `--brand-primary`-tinted pill, medium gets solid Terracotta
  with white text, high keeps its existing `red-200`/`red-800` pairing untouched (already distinct
  and appropriately alarming — not broken, not touched). Verified against a real Gemini diagnosis
  (the demo account's test upload, correctly identified as "no plant visible" by the actual API,
  not a mock) rendering the new none/low style correctly.
- Calendar's "task due" indicator was a barely-visible 6px dot (`h-1.5 w-1.5`) — enlarged to 8px
  (`h-2 w-2`), confirmed visibly clearer via screenshot.
- Layout width: every page — genuinely form-shaped content and grid-shaped content (the calendar
  grid, photo journal grid, admin equipment/report lists) alike — was squeezed into the same
  narrow column, wasting most of the viewport on desktop for the latter. Introduced a two-tier
  system: forms stay narrow (`max-w-2xl`/`max-w-3xl`, unchanged), content pages widen to
  `max-w-4xl` (`/calendar`, `/journal`, `/admin/equipment`, `/admin/reports`). Required
  restructuring `src/app/admin/layout.tsx` first — it wrapped *every* admin page (including the
  genuinely-form-shaped Branding/Billing/AI) in one shared width, so Equipment/Reports couldn't
  widen independently; pulled the constraint out of the layout and down into each page, matching
  how every other top-level page in the app already owns its own `mx-auto max-w-*` wrapper.
  Journal's photo grid also gained an `lg:grid-cols-4` tier so the extra width is actually used.

**Scoped out, documented as a follow-up, not done now**: reworking the 13 `hover:opacity-90`
button hover states to a proper `color-mix()`-based darken (reducing opacity over a light page
background makes a saturated button *lighter*, not a real pressed-state darkening — a real but
separable improvement that would have doubled this pass's diff for a marginal visual win beyond
what the audit actually flagged as broken).

Verified: Playwright screenshots of `/login`, `/dashboard`, `/calendar`, `/journal`, `/plant-health`
(light theme, matching the already-fixed dark-mode-OS-preference behavior), a keyboard-tab
screenshot confirming the new on-brand focus ring renders in place of the browser default, and a
`getComputedStyle` check confirming `--text-muted`, `--color-terracotta`, `--brand-primary`, and
the newly-rolled-out `--brand-secondary` all resolve to their intended values on a live page.
`tsc --noEmit` and `eslint` both clean. Test diagnosis/photo data generated against the demo
account during verification was cleaned up afterward (DB rows and the orphaned upload file).

---

## Layout Pass

Follow-up to the accessibility/palette pass, this time auditing at 375px (mobile) alongside the
usual 1280px desktop — not checked in either prior UI pass this session.

**Real bug found**: the site header (previously inline in `src/app/layout.tsx`) had zero
responsive behavior — confirmed via screenshot, the logo and "Dashboard" link visually ran
together at 375px with no wrapping, and the email address broke awkwardly mid-row. Fixed by
extracting a new `src/components/SiteHeader.tsx` (`"use client"`, needs `useState` for the mobile
toggle, which an async Server Component can't hold). `layout.tsx` hoisted its inline sign-out
closure to a named `async function signOutAction() { "use server"; ... }` and now passes
`tenant`/`session`/`isPaid`/`signOutAction` down as props — passing a Server Action reference into
a Client Component is standard Next.js behavior, confirmed correct for this project's Next 16.3.0,
though it's a new pattern here (nothing else in the codebase did this before).

The mobile nav follows the WAI-ARIA *disclosure* pattern (not a modal): `aria-expanded` +
`aria-controls` + a toggling `aria-label` on the hamburger button, Escape-to-close, and — since the
open/closed panel is conditionally rendered rather than CSS-hidden — closed-state links are
automatically out of the tab order for free. Deliberately **not** built: focus trapping or
forced-focus-into-panel-on-open, both real requirements for a Dialog/Modal but not for a disclosure
widget pushing inline content, confirmed via a design-validation pass before implementing so as not
to over-engineer a simple nav reveal. Bundled in one related defensive fix: the header's email
`<span>` gained `max-w-[180px] truncate` (with a `title` for the full value) since a long
institutional email — this is a multi-tenant app — could still overflow the row even above the
`md:` collapse breakpoint.

**Real underuse of space found**: `/dashboard` and `/grow-plan` were both capped at `max-w-2xl` on
a 1280px viewport, wasting over half the screen — missed in the prior pass because neither looked
"grid-shaped" at a glance, unlike the calendar/photo-journal/admin-list pages that were already
widened. Fixed:
- `/dashboard` (→ `max-w-5xl`) now splits into a two-column hierarchy on `lg:`: a primary column
  (This week's tasks + garden profile — the actually-actionable content) and a secondary rail (the
  7 navigational resource-link cards, correctly de-emphasized as secondary, tightened from `p-6` to
  `p-4`). Collapses to the original single column below `lg:` automatically via CSS Grid, so mobile
  is unaffected and content order stays primary-then-secondary.
- `/grow-plan` (→ `max-w-4xl`) and `/plant-health` (→ `max-w-4xl`) both changed their
  recommendation/history lists from a forced single column to a `grid md:grid-cols-2` /
  `grid lg:grid-cols-2` respectively — grow-plan's cards are shorter (crop name, badge, reasoning,
  harvest estimate) so they split at a narrower breakpoint than plant-health's denser cards
  (explanation + two lists + a date), which need more room per column before doubling up.

Verified via Playwright screenshots at both 375px and 1280px across `/dashboard`, `/grow-plan`,
`/plant-health`, and the header on `/login`: mobile shows a working hamburger menu opening a
stacked link panel (screenshotted), desktop nav is visually unchanged from before this pass, the
dashboard two-column split and the grow-plan/plant-health grids all render correctly at desktop
width and correctly collapse to one column on mobile. Confirmed programmatically (not just
visually): `aria-expanded` flips `false`→`true` on menu open, and Escape closes the panel
(`#mobile-nav` element count drops to 0). `tsc --noEmit` and `eslint` both clean.

---

## Bug Fix — /garden had no way to add or edit equipment

Reported: "`/garden` isn't doing anything, can't add growing spaces or edit their equipment."
Root-caused, not guessed at: `userEquipment` (owned pots/trays/planters/beds) was only ever written
by the onboarding wizard's equipment step — a one-time step, with zero other write sites anywhere
in the app (confirmed via grep). `/garden`'s placement mechanism (`GrowingAreaManager`'s +/-
steppers, `syncGrowingAreasAction`) was independently verified correct and unrelated to the bug —
it just had nothing to place for any account with zero recorded equipment (true of the demo
account, and of any real user who wants to record equipment bought after signup).

**The obvious fix was wrong, and worth recording why.** `saveEquipmentAction`'s existing save logic
deletes every one of a user's `userEquipment` rows and reinserts them fresh on every save — fine
for onboarding (nothing references those rows yet), but `growingAreas.sourceUserEquipmentId`
references `userEquipment.id` with `ON DELETE SET NULL`. Reusing that logic verbatim for a
post-onboarding editor would've assigned new random ids to every row on every save — even rows the
user didn't touch — silently severing every existing placement's link on each edit (not deleting
the growing area, just orphaning it and making it vanish from `/garden`'s "placed" counts). Caught
during planning, before writing any code, by reading the FK definition rather than assuming the
existing action was safe to copy.

**Fix**: new `src/lib/garden/equipmentRows.ts` — a real upsert-by-id (`applyEquipmentRows`), not a
delete-all-reinsert-all. Every row (existing or new) always carries a client-generated
`crypto.randomUUID()`; the sync is `DELETE ... WHERE user_id = X AND id NOT IN (submitted)` followed
by a single batched `INSERT ... ON CONFLICT (id) DO UPDATE`, matching this codebase's established
upsert idiom (`src/lib/actions/admin.ts`) rather than a hand-rolled per-row loop. Added
`setWhere: eq(userEquipment.userId, userId)` on the conflict clause — a pattern not used elsewhere
in this codebase yet, but necessary here: RLS only enforces tenant isolation, not per-user, so
without it a same-tenant user could in principle submit another user's real `userEquipment.id` as a
"new" row and overwrite it via the upsert.

`EquipmentPicker` (the row-editing form UI) moved from `src/app/onboarding/equipment/` to
`src/components/` — matching this codebase's convention that cross-route-tree components live
there (`SiteHeader.tsx`, `JobInterstitial.tsx`) — and its submit action/button labels became props
instead of hardcoded, so the identical component now serves both `/onboarding/equipment` (labelled
"Continue", redirects to the next step) and the new `/garden` "Your equipment" section (labelled
"Save equipment", stays on the page and shows a "Saved." confirmation via the same `ActionState`
shape already used by every admin form).

**Deliberately deferred**: reducing an equipment type's quantity below its currently-*placed* count
via the new editor doesn't auto-shrink the existing `growingAreas` rows — the `+` stepper correctly
disables, but a stale "N placed" count persists until manually clicked down via the already-correct
`syncGrowingAreasAction` clamp. No data corruption, just a cosmetic over-count; out of scope for
"let people add equipment at all," and the clamping logic already exists to wire up later if needed.

Verified end-to-end against the live demo account (which had zero equipment, exactly reproducing
the report): added equipment via the new editor, placed growing areas from it, then — the critical
check — edited equipment again (bumping one type's quantity, leaving another untouched) and
confirmed via direct Postgres query that **both** rows kept their original ids and both existing
placements stayed correctly linked, not orphaned. Then removed a row entirely and confirmed its
growing area survived with `source_user_equipment_id` set to `NULL` rather than being deleted.
Separately confirmed the onboarding equipment step itself still saves and advances normally for a
fresh signup (shared logic, regression risk). `tsc --noEmit` and `eslint` clean. The demo account's
equipment/growing-area state and the fresh onboarding test user were both cleaned up afterward,
restoring the demo account to the zero-equipment state it was in before this fix (screenshotted, not
just asserted, to confirm the editor now genuinely renders and works).

---

## Feature — editable favourite crops after registration

Requested directly: favourite fruit/veg picking only happened once, during the onboarding swipe
deck (`/onboarding/crops`), with no way to revisit it afterward. Unlike the `/garden` equipment fix,
this needed no data-model care — `userFavoriteCrops` (one row per user+crop, `liked: boolean`,
unique on `(userId, cropId)`) isn't referenced by any other table, and the existing
`recordCropSwipeAction` was already a correct, generic upsert (`onConflictDoUpdate` on the unique
pair) with no onboarding-specific behavior baked in — safe to reuse as-is, just renamed and moved.

Moved `src/lib/actions/onboarding/crops.ts` → `src/lib/actions/crops.ts` as
`setCropPreferenceAction` (same signature, same logic — "record*Swipe*" no longer described its
callers once a heart-tap on a grid could invoke it too, not just a swipe gesture). New
`/favourites` page + `FavouriteCropsGrid.tsx`: unlike the swipe deck (queue of undecided crops,
one at a time, first-impressions UX), editing calls for reviewing *all* crops at once — a grid of
every seeded crop (26 today) with a heart toggle per card, liked ones visually distinguished
(filled heart, tinted border). Un-favouriting sets `liked: false` rather than deleting the row,
matching the schema's existing model (grow-planner reads `dislikedCropSlugs` from exactly this
signal to actively avoid recommending them, not just "no opinion").

Surfaced two ways from `/dashboard`: a new "Favourite crops" resource-link card, and the existing
"Favourite crops picked: N" line in the garden-profile summary is now itself a link.

Verified against the live demo account (zero preferences beforehand): toggled two crops on,
confirmed both rows in Postgres; un-favourited one, confirmed the row persists with `liked: false`
rather than being deleted while the untouched one stays correct; confirmed the dashboard's count
updates to match. Separately confirmed the onboarding swipe deck still records preferences
correctly under the new import path (regression risk from the move/rename). One real test race hit
during verification, fixed in the test not the app: the grid's heart-toggle button label and the
"N favourited" count both update optimistically on click, before the server round-trip resolves —
asserting against Postgres immediately after a `waitForSelector` on that optimistic state was racy;
fixed by waiting for the button's own pending-disabled state to clear instead. `tsc --noEmit` and
`eslint` clean. Demo account preferences and the fresh onboarding test user were cleaned up
afterward.

---

## UI tweak — dashboard "This week" grouped by date, AI badge removed

Requested directly. `src/app/dashboard/ThisWeekTasks.tsx` grouped its flat, date-sorted task list
under a heading per due date (`Today`/`Tomorrow`/`Weekday, D Mon` — computed client-side, since the
server already scopes the list to the next 7 days and passes each task's plain `dueDate` string) and
dropped the per-task `uppercase` source pill for `"ai"`-sourced tasks; the `"weather"` pill (a
distinct, useful signal — this is the task that appears/disappears based on the actual forecast) was
kept. The now-redundant trailing date text on each row was removed too, since the group heading
already conveys it.

While verifying, found the demo account had accumulated 5 grow plans and 25 duplicate tasks from
repeated `pnpm`-adjacent testing across earlier sessions (each "Generate a new plan" call during
verification left its tasks behind — `tasks` has no FK back to the `grow_plans` row that created
them, so old plans' tasks never got cleaned up even though the grow-plan UI itself only ever shows
the latest plan). Not something the user asked for, but directly relevant to whether "This week"
actually looks good, and a byproduct of my own testing on a persistent demo account rather than real
user data — cleaned it up (deleted all grow_plans/plan_recommendations/tasks for the demo user,
regenerated one fresh grow plan through the real UI) rather than leaving it for a future session to
trip over.

---

## Feature — shopping list auto-adds seed & equipment purchases from grow plans

Requested, then scoped via a clarifying question (3 options offered; user picked the broadest):
seed purchases implied by a grow plan previously only reached the shopping list via a Monday-06:00
cron job with a 14-day lookahead (`weeklyShoppingList.ts`), and the "Add to shopping list" badge on
`/grow-plan` recommendation cards was purely decorative — confirmed via grep, it was a `<span>`,
never wired to any action. Equipment never touched the shopping list at all.

**Honest scoping call, made explicit rather than silently guessed**: crops have no equipment
relationship anywhere in this schema — no crop→equipment-type mapping exists, and inventing one
(e.g. "carrots need a raised bed") would mean hand-authoring domain knowledge not backed by any
real data. So "equipment relevant to the grow plan" is deliberately *not* per-crop; it's "growing-
space equipment you don't yet own, surfaced the moment a plan gives you a reason to think about
it" — narrowed to `SLUG_TO_GROWING_AREA_TYPE`'s 5 types (seed trays/pots/planters/raised beds/
garden beds), explicitly excluding the watering can even though it's in the same tenant equipment
catalog, since that mapping's own existing comment already draws the right distinction: "a tool,
not growing space."

**Schema**: `shopping_list_items` gained `equipmentTypeId` (nullable, FK `equipmentTypes`), and its
two-column XOR check constraint became a real three-way `num_nonnulls(crop_id, free_text,
equipment_type_id) = 1`, renamed (not reused) so the migration diff was unambiguous — confirmed
Postgres's `num_nonnulls` accepts the mixed uuid/text columns via its `"any"`-pseudo-type variadic
with no cast needed. Generated migration was exactly the predicted clean `DROP CONSTRAINT` +
`ADD COLUMN` + `ADD CONSTRAINT` triple, no manual SQL. RLS + constraint spot-checked directly
against Postgres (both invalid-combination rejections and the cross-tenant negative test).

**Immediate insert**, added to `generateGrowPlan.ts`'s existing `persist-results` transaction
(same one that writes `planRecommendations`/`tasks`) rather than a new step: seed items for every
`requiresPurchase` recommendation, and equipment items for every un-owned growing-space type — both
deduped by "already exists for this user+item, regardless of status" (mirrors
`weeklyShoppingList.ts`'s own convention exactly, so a purchased-and-since-forgotten item never gets
re-suggested). `weeklyShoppingList.ts` itself was deliberately left unchanged — not dead code, a
real backstop for plans generated before this shipped, confirmed empirically (not just reasoned
about): triggered it directly against a demo account that already had immediate items and confirmed
it added nothing new. The "no race against the weekly cron" claim is stronger than "probably fine"
— both writers' recommendation-read and shopping-item-write happen inside the *same* transaction,
so under Postgres's READ COMMITTED isolation the weekly job can never observe a recommendation
without also observing its already-committed shopping-list item.

**UI**: since the schema now supports equipment items, the manual "Add" form on `/shopping-list`
gained a real third mode ("Equipment," alongside "From catalog"/"Custom item") rather than leaving
equipment items addable only by the system — a schema capability with no matching UI would've been
a half-finished feature. Equipment items render with a generic 🧰 icon (equipment types have no
per-type emoji in the schema, unlike crops).

Verified against the demo account, including a real mixed-ownership scenario (some stray leftover
equipment rows from earlier sessions' testing meant the account already owned pots/raised-beds/
seed-trays but not planters/garden-beds — a better test than a clean-slate account, since it
actually exercises the "owns some, not others" filtering rather than an all-or-nothing case):
generated a plan, confirmed exactly the un-owned types got added and the watering can didn't;
regenerated the plan and confirmed zero duplicates; manually added a watering can via the new
Equipment mode and confirmed it renders, persists, and toggles correctly. `tsc --noEmit` and
`eslint` clean. Demo account's shopping list, grow plans, tasks, and equipment were reset to a
clean baseline afterward and one fresh grow plan regenerated through the real UI, same restoration
pattern as the two other fixes this session that touched the persistent demo account.

---

## Fix — shopping list suggested garden beds (not purchasable) and re-nagged for owned equipment

Two corrections from the user, both real, both about the shopping-list auto-add feature above:

1. **Garden beds aren't a product.** Unlike pots/planters/raised beds/seed trays, a "garden bed" in
   this app is just ground in the user's own garden they've designated for growing — nothing to buy.
   The equipment-suggestion logic had been reusing `SLUG_TO_GROWING_AREA_TYPE` wholesale (all 5
   growing-space types), which conflated "can be placed as a growing area" with "can be purchased."
   New `PURCHASABLE_GROWING_SPACE_SLUGS` in `src/lib/garden/equipmentMapping.ts` — the same 5-type
   set minus `garden-beds` — used only by the shopping-list suggestion logic in
   `generateGrowPlan.ts`. `SLUG_TO_GROWING_AREA_TYPE` itself is untouched, since garden beds are
   still a completely valid *placeable* growing area on `/garden` — only the "should we suggest
   buying this" question changed.
2. **Owning equipment should stop the shopping-list nagging, not just prevent new nags.** The
   original design already excluded currently-owned types from *new* suggestions at grow-plan-
   generation time, but that's a one-time check — nothing reconciled *existing* pending shopping
   items against equipment recorded *afterward* via `/garden`'s editor (the two data models are
   otherwise fully independent, by design, since the earlier `/garden` fix this session went to real
   trouble to keep `userEquipment` row identity stable rather than churning it). Fixed in
   `updateEquipmentAction` (`src/lib/actions/garden/equipment.ts`): after saving equipment, any
   *pending* shopping-list item for a type just confirmed as owned gets marked `purchased` — not
   deleted, so it still shows in the "already got" section as a record, rather than silently
   vanishing. Scoped to one direction only (owning something clears the ask to buy it); removing
   equipment from inventory does *not* re-add a shopping-list suggestion — a more aggressive,
   unrequested behavior that risks re-nagging someone for a reason they can't see (e.g. they just
   corrected a data-entry mistake).

Verified against the demo account from a clean slate: generated a plan, confirmed the shopping list
got the 4 genuinely-purchasable equipment types but never "Garden Beds"; then recorded "Pots" as
owned via `/garden`, confirmed via direct Postgres query that specifically the Pots shopping item
flipped to `purchased` while every other pending item (seed trays, planters, raised beds) was left
untouched — proving the reconciliation is scoped to what was actually just saved, not a blanket
"clear everything" pass. `tsc --noEmit` and `eslint` clean. Demo account reset and one fresh grow
plan regenerated afterward, same restoration pattern as every other fix this session touching it.

---

## Feature — self-extending crop knowledge base

Requested by the user: today `crops` (spacing, soil depth, sow windows, harvest days, feeding
notes) is a hand-curated, 25-row global catalog, and the grow-planner AI was hard-constrained to
only ever recommend crops already in it. The ask was to make the catalog grow itself — when the AI
would recommend a crop that isn't cataloged yet, look it up once via a dedicated AI call, persist
the result, and never ask again, for any tenant, since `crops` is deliberately global/non-tenant-
scoped. Explicitly accepted risk: a newly-added crop is usable in a live recommendation immediately,
marked `verified: false`, with no admin-review gate before use for v1 — the flag exists so a review
workflow can be added later without a further migration, but building that workflow itself was
out of scope this round.

**Schema** (`src/db/schema/crop.ts`, migration `0011_yielding_christian_walker.sql`): `crops` gained
`verified` (boolean, default `true` — every curated row stays `true`; only the new AI-backfill path
sets `false`), plus nullable `sourceProvider`/`sourceModel`. The latter two exist specifically so a
mock-fallback-created row (`"mock"` / `"mock-crop-facts-v1"`) stays distinguishable from a row a real
model genuinely attempted but left unreviewed — without them the two would look identical once
persisted, unlike every other mock path in this app, whose output is shown once and discarded rather
than written into a shared table forever.

**Third AI agent slot**: `tenantAIConfigAgentEnum` (`src/db/schema/tenant.ts`) gained `"crop_facts"`
— confirmed a zero-migration change, since that column is a plain `text` field with no DB-level enum
constraint (the Drizzle `{ enum: [...] }` option is TypeScript-only). Kept as its own slot rather than
reusing `grow_planner`: matches the existing one-capability-per-slot granularity (planning and
diagnosis are already separate despite both being "gardening AI"), lets a tenant point it at a
cheaper/faster model, and stops a misconfigured planning key from also breaking catalog backfill.
`/admin/ai`'s `AGENT_LABELS` gained one entry; its form section rendered automatically since that
page already iterates the enum.

**New agent** `src/lib/ai/agents/cropFacts.ts` (`getCropFacts(tenantId, cropName)`) mirrors
`growPlanner.ts`'s shape: a Zod `CropFactsOutputSchema` covering every insertable `crops` column
*except* `name`, which is an input parameter, not something the agent invents and then has discarded
in favour of the caller's own value. Resolves via `getModelForTenant(tenantId, "crop_facts")`; the
dev-mode mock fallback returns a generic, clearly-labelled guess.

**`growPlanner.ts`**: `recommendations[]` gained `newCropName: string | null`, set only when
`cropSlug` isn't in the supplied catalog, with the same `cropSlug` string reused across that crop's
`tasks[]` (tasks already tolerated an unresolved slug by falling back to `cropId: null`, so nothing
new breaks if the AI is ever inconsistent). The prompt's catalog line changed from "only recommend
crops from this list" to "prefer this catalog, but you may propose a well-established, common
home-garden crop not listed if you're confident about it." `buildMockPlan` gained one hardcoded
new-crop recommendation + task ("Swiss Chard") so the mock path exercises the *entire* pipeline,
including `cropFacts.ts`'s own mock fallback, not just the catalog-only case.

**`generateGrowPlan.ts`** gained a `resolve-new-crops` step between `call-agent` and
`persist-results`, inside the existing `try` block so a failure there still routes to `mark-failed`.
Per candidate, in this order: live `SELECT` by slug against `crops` *before* ever calling the facts
agent (a crop another tenant already backfilled must never trigger a second AI call) → only on a
genuine miss, call `getCropFacts` → `INSERT ... ON CONFLICT (slug) DO NOTHING` with `sortOrder` set
past the current max (computed once per step run) so new crops append after the curated list rather
than sorting first → re-`SELECT` for the definitive winning row. Processed sequentially (`for...of`,
not `Promise.all`) so a duplicate proposal within one output self-dedupes on its second pass. Returns
a map merging the original catalog snapshot with every newly-resolved id, so `persist-results`'
existing `cropIdBySlug[...]` lookups (recommendations, tasks, and the shopping-list auto-add block
from the previous feature) pick up new crops with zero further code changes. Accepted, documented
sub-risk: dedup is exact-slug-match only — a near-duplicate (different casing, a synonym, a
different slugification of "the same" crop) isn't caught and creates a second `verified: false` row,
a nuisance for a future admin-review pass to merge, not a correctness bug.

`/grow-plan`'s recommendation cards show a small "New, unverified" badge when the joined
`crop.verified === false`.

Verified two ways, since the demo tenant has a real Gemini key configured (so the deterministic mock
path doesn't run against it): (1) triggered a real grow-plan generation end to end against the demo
account — confirmed the modified schema/prompt didn't break the live `generateObject` call, and the
existing recommendation/task/shopping-list pipeline still worked correctly afterward (0 new shopping
items, since everything needed was already listed from a prior plan — the existing dedup logic held
up unchanged); (2) isolated the `resolve-new-crops` dedup/insert logic itself (the genuinely novel,
race-sensitive part) against the real dev DB with a hardcoded facts object, confirming a first call
inserts a `verified: false` row stamped `sourceProvider: "mock"` with `sortOrder` correctly past the
curated max, and a second call for the same crop hits the live-check path and reuses the same row
rather than creating a duplicate. `tsc --noEmit` and `eslint` clean across the full project. All test
grow-plan/task/recommendation rows and the test crop were deleted afterward; the demo account's
`crops` table and grow-plan history are back to their pre-test baseline.

---

## Feature — grow planner fills existing growing areas

Requested by the user: "The grow planner needs to take into account and make use of the growing
areas and the equipment the user has in their inventory. The user should be able to add growing
spaces which can then be filled by the grow planner, not the other way around." Until now the
planner only ever saw aggregate counts (`"3x raised_bed"`) and never assigned a recommendation
anywhere specific — its own prompt comment admitted as much: `GROWING SPACE (totals, not assigned
to specific recommendations yet)`. `growingAreas.status` (`available`/`in_use`) already existed in
the schema, unused, with a comment explicitly anticipating this exact feature ("nothing can be
`in_use` yet in this phase, but the ordering is already correct for when Planting exists").

**Schema**: `planRecommendations` gained a nullable `growingAreaId` FK to `growingAreas` (`onDelete:
"set null"`, same orphan-not-cascade pattern as `tasks.cropId`) — migration
`0012_short_carmella_unuscione.sql`.

**`generateGrowPlan.ts`** gained a new first step, `free-previous-growing-areas`, run before
`gather-context`: resets all of the user's `in_use` areas back to `available` and nulls any
`planRecommendations.growingAreaId` still pointing at them. Without this, regenerating a plan would
find zero available areas (all still claimed by the *previous* run) and produce nothing — every
generation is a full re-plan of the whole plot, matching how the app already treats only the latest
plan as authoritative. `gather-context` now passes the real, individual available areas
(`id`/`type`/dimensions) instead of collapsing them into counts, plus a new `unplacedEquipment`
figure (owned equipment quantity minus how much of it is actually placed as growing space,
regardless of that space's status) so the AI can nudge the user toward placing spare capacity
rather than the planner ever inventing space itself. `persist-results`' recommendation filter
(previously only checking the crop slug resolved) now also requires `growingAreaId` to be a real,
not-yet-claimed area from this run — same silent-drop-on-invalid-reference pattern already used for
hallucinated crop slugs, and the dedup (first claim wins) doubles as the real capacity cap, since an
area can never be assigned twice. Matched areas get `status = 'in_use'` immediately after the
recommendations insert, in the same transaction.

**`growPlanner.ts`**: `GrowPlannerInput` swaps `growingAreaCounts` for the real `growingAreas` list
plus `unplacedEquipment`; `GrowPlanOutputSchema.recommendations[]` gained a required
`growingAreaId`. Prompt now lists each available area by id and instructs the AI to assign every
recommendation to exactly one, preferring a dimension fit (crop spacing/soil depth vs. area
width/length/depth) where both are known but never leaving an area empty over an imperfect fit.
`buildMockPlan` reworked to cap its picks at the number of available areas and zip them 1:1 (the
existing synthetic "Swiss Chard" new-crop demo now only appears if there's a spare area left after
the capped real picks, so the mock path can never claim more areas than exist either).

**Generation gate**: a user with zero `growingAreas` rows at all (any status — regenerating frees
`in_use` ones automatically, so only true zero should block) can't generate a plan. `/grow-plan`
checks this once and swaps the Generate/regenerate button for a card pointing at `/garden` in every
state (empty, failed, complete) rather than just the empty one, since the same underlying gap
applies throughout. `generateGrowPlanAction` got the identical check server-side as a defensive
backstop — a server action must never trust that the UI already prevented reaching it.

**Display**: `/grow-plan` recommendation cards now show which area they're filling (type, emoji,
size) via a left join (nullable FK, so older or since-removed area references degrade gracefully by
just not showing a location). `/garden`'s `GrowingAreaManager` visualization cards now distinguish
occupied from empty slots — occupied ones show the actual crop (emoji, name, a "Growing" label,
tinted border) via a new left-join query in `page.tsx` (`growingAreas` status `in_use` → 
`planRecommendations` → `crops`, grouped by `sourceUserEquipmentId`) — so the effect of generating a
plan is visible in the same place the user manages space, not just invisible plumbing behind a
stepper that quietly refuses to go below the occupied count.

**Explicitly out of scope** (documented, not silently dropped): multiple crops sharing one growing
area — each area holds exactly one recommendation at a time, matching the schema's existing binary
`status` column exactly as already scaffolded, not a new capacity/percentage model; linking `tasks`
to a growing area (calendar/task management doesn't need it, only the recommendation view does);
hard server-side dimension-fit validation (prompt guidance only, same as `spacingCm` was already
handled everywhere else in this codebase); any change to the watering can, the only non-growing-
space equipment type, confirmed via `src/db/seed-data/equipment.ts` — it has no bearing on what can
be grown.

Verified against the demo account with a live Gemini key (no Playwright/browser tool available this
session, so verification was direct-Postgres-plus-real-Inngest-trigger, consistent with how every
prior feature this session was checked at the data layer): seeded 3 real growing areas (a pre-
existing orphan raised bed with no equipment link, plus 2 pots newly placed from 3 owned, leaving 1
genuinely unplaced), triggered a real generation, and confirmed all 3 recommendations landed on
distinct areas, all flipped to `in_use`, dimensions correctly referenced in the AI's own reasoning
text ("50cm deep bed", "20cm pot"), and the summary proactively suggested placing the spare pot for
a specific crop — the `unplacedEquipment` nudge working exactly as designed, unprompted, from the
live model. Regenerated and confirmed the free/reassign cycle: the previous run's 3 recommendations
had `growingAreaId` nulled, the same 3 areas got reused by the new run with zero duplicate claims
and zero areas left orphaned in `in_use`. Verified the `/garden` occupancy join directly against
Postgres, confirming it returns exactly the current plan's crop per occupied area with no stale
rows leaking in from the freed prior plan. `tsc --noEmit` and `eslint` clean across the full project.
All test grow-plan/task rows and temporary equipment/growing-area rows were removed afterward, and
one final real plan was regenerated so the demo account is left with a genuine, presentable
in-use raised bed rather than test debris.

---

## Feature — multi-stage grow planner (seed tray → pot → final space)

Requested by the user: "ensure that the grow planner considers the full cycle of seed trays (where
applicable), transplantation to pots, transplantation to the plant's final growing space. When
tasks for transplantation are completed the previous piece of equipment should be released from
the inventory and the next marked as in use in the inventory." Until now a recommendation was
assigned to exactly one growing area for its whole life. Real gardening often isn't one-stage — a
crop with an indoor sow window is commonly started in a seed tray, potted on, then planted out into
its final bed. "Where applicable" means the AI decides per crop (using the catalog's
`sowIndoorFromMonth/ToMonth` fields already in the prompt) how many stages it needs; most stay
single-stage exactly as before.

Design validated in a review pass against the actual code before implementation — it caught a real
staleness bug in the first draft (freeing an area without also clearing the *old* stage row's
pointer to it would let a reassigned pot's occupancy join show the previous plan's crop once
reassigned), corrected the ownership-check approach for the new task-completion logic (no extra
join needed — scoping the task fetch by `userId` already suffices), and flagged a required step
easy to miss (`db:harden` must re-run after the migration so the new table's RLS is actually
enforced against the app role, not just defined in the schema).

**Schema**: `growingAreaStatusEnum` widened to `available | reserved | in_use` — `reserved` means
earmarked for a later stage of a specific recommendation, claimed so nothing else can take it but
not physically holding anything yet. New table `planRecommendationStages` (`src/db/schema/grow-
plan.ts`): one row per stage of a recommendation's lifecycle (`stageIndex`, `growingAreaId`,
`status: upcoming|active|done`), every recommendation gets at least one (even today's single-stage
crops, `stageIndex: 0`). `planRecommendations.growingAreaId` is **removed** entirely, replaced by
always going through the stages table — rejected keeping it as a denormalized "current stage"
convenience column since four separate write paths (persist, task-completion forward/reverse, plan
regeneration) would each need to remember to keep it in sync, for an immaterial query-cost saving.
No backfill migration — dev/demo data only, a plan is one click to regenerate. `tasks` gains
`activatesStageId` (nullable FK to the new table) — set only on the task representing a transplant
into a given stage; the human-readable title stays free text as before.

**AI schema/prompt** (`src/lib/ai/agents/growPlanner.ts`): `recommendations[].growingAreaId`
became `recommendations[].stages: {growingAreaId}[]` (1-3, ordered first-to-final).
`tasks[].activatesGrowingAreaId: string | null` lets the AI mark which task performs a given
transition, resolved server-side to a real `activatesStageId` via a map built from the just-
inserted stage rows — no synthetic ids needed since each stage's `growingAreaId` is already unique
per plan by construction. Prompt gains guidance: most crops need one stage; an indoor sow window is
the natural signal for starting in a seed tray or pot first; never invent a stage without real,
distinct space for it. `buildMockPlan` reworked from "one area per recommendation" to a type-aware
pool (seed tray / pot / final-space types tracked separately) so it can build one genuine
multi-stage demo (with a matching transplant task) whenever a seed tray and a final-space area are
both available, falling back to single-stage otherwise — every mock path in this app should be
fully exercisable without a live key, not just the common case.

**`generateGrowPlan.ts`**: `free-previous-growing-areas` widened to free `reserved` areas too (not
just `in_use`), and — the bug the review caught — now also nulls `planRecommendationStages
.growingAreaId` for old stage rows still pointing at a freed area (previously this nulling happened
on `planRecommendations` directly; retargeted at the new table since that column no longer exists).
Without this, a freed-and-reassigned pot would carry two stage rows pointing at it, one stale-
`active` from the superseded plan and one real-`active` from the new one, and the `/garden`
occupancy join would show the wrong crop. `persist-results` insert order: recommendations →
stages (via `.returning()`, building a `growingAreaId → stageId` map) → two `UPDATE growing_areas`
calls (stage-0 ids to `in_use`, stage 1+ ids to `reserved`) → tasks (resolving
`activatesGrowingAreaId` through the map) → existing shopping-list/equipment logic, unchanged.
Stage validation extends the existing dedup-by-first-claim check (previously one id per
recommendation) to walk every stage of every recommendation against the same available/not-yet-
claimed set, truncating at the first invalid/duplicate stage rather than dropping the whole
recommendation — stage 0 alone is still a fully valid, if downgraded, plan.

**`toggleTaskCompleteAction`** (`src/lib/actions/tasks.ts`) — the single choke point every task
checkbox in the app already called — gained the release/claim mechanics: completing a task with
`activatesStageId` set marks the preceding stage `done` + releases its area, and the target stage
`active` + claims its area. Un-completing mirrors this in reverse (current stage back to `upcoming`
/ reserved, preceding stage back to `active`/`in_use`), guarded so an area that's since been deleted
or reassigned elsewhere just gets skipped rather than erroring — the whole point of the feature is
the release/claim symmetry, so leaving state stuck forward on an accidental un-check would undermine
it. A lightweight idempotency guard (only apply the transition if the task's freshly-read DB status
is actually changing) covers a double-click firing two overlapping toggles, matching this
codebase's existing risk tolerance (no row locking used here or elsewhere in this pipeline).

**UI**: `/garden`'s occupancy join relocated from `growingAreas → planRecommendations.growingAreaId`
to `growingAreas → planRecommendationStages(status='active') → planRecommendations → crops`, plus a
parallel query for `reserved`-status areas so those tiles can show *which* crop they're earmarked
for (not just a bare "reserved" label) — `GrowingAreaManager`'s visualization cards now render three
distinct states (growing / reserved / empty) instead of two, closing a gap the feature would
otherwise leave confusing (a seemingly-empty pot silently refusing to let the stepper go below its
placed count, with no visible reason why). `/grow-plan`'s recommendation grouping (built one task
ago — identical crop+area-type+size recommendations collapse into one "3 x 20cm pots of Spring
Onions" card) now groups by a recommendation's *current* stage rather than a fixed area, so two
sibling instances that have progressed to different stages correctly end up in different groups;
cards also surface a "next: pot, once transplanted" hint from the immediate next `upcoming` stage.

**Explicitly not validated**: stage-type ordering (that stage 0 is actually a seed-tray/pot type and
the last stage a final-space type) — prompt guidance only, consistent with how crop-to-area
dimension fit was already never server-validated either.

Verified via direct Postgres + a real end-to-end Inngest trigger against the demo account (no
browser tool available this session): a real generation against the live Gemini key completed
successfully and produced five single-stage recommendations, correctly exercising the unchanged
common path post-refactor (the AI judged these particular late-summer crops didn't need seed-tray
starting — a legitimate model decision, not a bug). Since the live model didn't choose to
demonstrate the multi-stage path in that run, hand-built a 3-stage recommendation (seed tray → pot
→ raised bed) directly in Postgres matching exactly what `persist-results` would produce, then
replicated `toggleTaskCompleteAction`'s exact SQL logic in a script (the real action itself needs an
authenticated Next.js request context via `auth()`, unavailable to a plain script) to drive it
through: potting-on correctly released the seed tray to `available` and claimed the pot to `in_use`
(leaving the still-reserved raised bed untouched); planting-out correctly released the pot and
claimed the raised bed; un-completing the planting-out task correctly reversed it back to the
post-potting-on state exactly. `tsc --noEmit` and `eslint` clean across the full project. All
hand-built test rows removed and the three borrowed areas reset to `available` afterward; the
demo account's real AI-generated plan (five recommendations, five correctly `in_use` areas, no
orphaned or duplicate claims) was left in place as its clean, presentable latest state.

---

## Feature — label indoor planting tasks

Requested by the user: "Let's label indoor planting tasks." Tasks had no structured signal for
whether a sowing task happens indoors (e.g. into a seed tray) versus directly outdoors — that
distinction only ever existed as free text in the AI's task title/explanation, with no way for the
UI to render a badge for it. Considered deriving this from the multi-stage data built one task ago
(a task's `activatesStageId` linking to a stage whose growing area is a `seed_tray`), but that
mechanism only covers *transplant* tasks (stage 1+) — the *initial* sow task (stage 0) has no
equivalent structural link today, and adding one risked a real bug: reusing `activatesStageId` for
the initial sow task would make un-completing it incorrectly release/reserve the crop's current
growing area, even though the plant is still physically there. Simpler and safer: let the AI say so
directly, the same way it already authors every other task detail (title, explanation, timing) —
add a plain `isIndoor` boolean the AI sets per task, independent of the stage-linking machinery
entirely.

**Schema**: `tasks` gains `isIndoor: boolean` (not null, default `false`). Manual and weather-
sourced tasks stay `false` (a user didn't say indoor; weather tasks are about protecting outdoor
plants) — only AI-generated grow-plan tasks ever set it `true`.

**AI schema/prompt** (`src/lib/ai/agents/growPlanner.ts`): `tasks[].isIndoor: z.boolean()` (required,
matching the existing style of other per-task fields — not nullable/optional). Prompt instruction 5
(already covering indoor-sowing preference) extended: mark `isIndoor` true on the sowing task
whenever it starts the crop indoors ahead of its outdoor season, false on every other task including
every later transplant. `buildMockPlan`'s one seed-tray-starting demo task gets `isIndoor: true`;
every other task (single-stage sows, feeding, succession, transplants, the new-crop demo) gets
`false` explicitly, keeping the mock's every-field-exercised guarantee intact.

**`generateGrowPlan.ts`**: one line — the `tasks` insert in `persist-results` now carries
`isIndoor: t.isIndoor` straight through from the AI's output alongside the existing fields.

**Display**: both places a task checkbox already renders — `src/app/calendar/CalendarView.tsx` and
`src/app/dashboard/ThisWeekTasks.tsx` — gained an "Indoor" badge next to the title when
`task.isIndoor`, styled consistently with the existing `source`/`missed` badges in each. Both
server components feeding them (`calendar/page.tsx`, `dashboard/page.tsx`, in both its "This week"
and embedded-calendar sections) now pass `isIndoor` through their existing per-field `.map()`
projections. `createTaskAction`'s `CreatedTask` type/return also carries `isIndoor` (always `false`
for manually-created tasks) purely for type consistency with the `Task` shape both client components
share.

Verified via a real end-to-end Inngest trigger against the demo account (live Gemini key): the AI
correctly used the new field — batch-indoor-start tasks like "Sow Lamb's Lettuce (Batch 1)" and "Sow
Spinach seeds (Batch 1)" came back `isIndoor: true`, each paired with a later "Transplant ... (Batch
1) to Planter/Raised Bed" task carrying a real `activatesStageId` (confirming these were genuine
multi-stage sequences, not mislabeled), while every "Direct Sow X in Raised Bed/Planter/Pot" task
came back `isIndoor: false` — exactly the intended distinction, unprompted beyond the prompt
instruction itself. `tsc --noEmit` and `eslint` clean across the full project. No test data required
cleanup this time (the verification run's plan was left in place as the demo account's genuine,
presentable latest state, consistent with how every generation this session either demonstrates the
feature cleanly or gets removed).

---

## Feature — pot sizing in cm or litres

Requested by the user: "In the user's inventory, pots should be able to have sizing in cm or
litres, update this and the growing agent to reflect this." `userEquipment`/`growingAreas` both
carried a `sizeLabel: text` column for the `"sized"` equipment category (today, only pots) — pure
free text with no unit concept at all (a placeholder just hinted "e.g. 20cm"); nothing parsed it
anywhere it was read. The ask was to make cm-vs-litres a real, structured choice end to end: the
inventory entry form, and what the grow-planner AI is told.

Design validated in a review pass before implementation — it found 2 raw `sizeLabel` accesses in
`/grow-plan/page.tsx` that bypass that file's own formatting helper entirely (the single-instance
recommendation card's size line and the "next stage" hint), which a less careful pass would have
missed since only one of the file's four touch points visibly goes through the helper. It also
caught that defaulting the new unit selector to "cm" needs to apply to *existing* rows too (every
one of which has `sizeUnit: null` after a no-backfill migration), not just freshly-added ones, and
confirmed dropping the old column with no backfill was safe and already precedented once this
session — free text can't be reliably reverse-parsed into a `(value, unit)` pair regardless.

**Schema**: new `sizeUnitEnum = ["cm", "litres"]` in `src/db/schema/equipment.ts`.
`userEquipment.sizeLabel` and `growingAreas.sizeLabel` both replaced with `sizeValue: real` +
`sizeUnit: text({enum: sizeUnitEnum})`, both nullable — matching this schema's existing
`widthCm`/`lengthCm`/`depthCm` convention of never DB-enforcing per-category requiredness, only
implying it through which UI fields render. No both-or-neither check constraint added either:
`widthCm`/`lengthCm` on these same tables have the identical two-columns-one-measurement
relationship with no such enforcement today, so adding one only for the new pair would be
inconsistent, unrequested strictness. Migration generated in two steps rather than one — a single
combined "drop one column, add two" diff on the same table sent `drizzle-kit generate` into an
interactive rename-vs-drop+add prompt with no TTY available in this environment to answer it; adding
the new columns first, then dropping `sizeLabel` in a separate follow-up migration, produced the
same end state with each step unambiguous.

**Shared formatter**: `formatSizeValue(value, unit)` added to `src/lib/garden/labels.ts` (already
home to `growingAreaTypeLabels`/`growingAreaTypeEmoji`) — takes two primitives rather than a shared
type, since the three call sites that use it (`GrowingAreaManager.tsx`, `grow-plan/page.tsx`,
`growPlanner.ts`) have genuinely different surrounding shapes and different "nothing to show"
fallback text (`null` vs `"size unknown"`); only the value-or-cm-or-litres formatting sliver is
shared, each site keeps its own outer fallback-to-width×length-string wrapper.

**Entry UI** (`src/components/EquipmentPicker.tsx`, shared by `/garden` and
`/onboarding/equipment`): the free-text "Size" field for `category === "sized"` became a number
input plus a cm/L `<select>`. New rows default to "cm"; the component's `useState` initializer
defaults *existing* rows the same way (`sizeUnit: r.sizeUnit ?? "cm"`) rather than only handling
newly-added ones, per the review's catch above. Both pages that feed this component
(`garden/page.tsx`'s two projections, `onboarding/equipment/page.tsx`'s one) updated to pass
`sizeValue`/`sizeUnit` through instead of `sizeLabel`, as did `syncGrowingAreasAction`'s copy from
owned equipment into a newly-placed growing area.

**Growing agent** (`src/lib/ai/agents/growPlanner.ts`): `GrowPlannerInput.growingAreas[]` carries
`sizeValue`/`sizeUnit`; the existing spacing/dimension-fit prompt instruction gained one clause —
a pot's size may be a cm diameter or a litres volume, and a litres figure should be judged with
general horticultural knowledge (rough bands: ~1-2L small herbs, ~5-10L most vegetables, 15L+
larger plants) rather than compared arithmetically against `spacingCm`/`soilDepthCm`, which only
makes sense for a diameter. `buildMockPlan` needed no change — confirmed it never reads area size
at all, only groups by `.type`; its type alias picked up the new fields automatically.

Verified via a real end-to-end Inngest trigger against the demo account: set one pot's growing area
to 10 litres and another to 20cm directly in Postgres, regenerated, and confirmed the full pipeline
(persisted correctly, `tsc`/`eslint` clean across all 13 touched files) completed without error —
the live AI didn't happen to choose those two specific pots out of the ~30 available ones for its
5 recommendations that run (pots are interchangeable to the picker, so this is expected, not a
bug), and forcing a specific choice by temporarily marking the other pots `reserved` turned out to
be unreliable — `free-previous-growing-areas` resets *all* of a user's `reserved`/`in_use` areas at
the start of every generation regardless of how they got that way, so a manual reservation outside
a real plan claim gets silently undone before `gather-context` ever runs. Relied instead on the
already-strong evidence: full-project `tsc`/`eslint` catching every remaining raw `sizeLabel`
reference as a compile error, direct Postgres confirmation that `sizeValue`/`sizeUnit` round-trip
correctly through the real pipeline unchanged, and a close read of `formatSizeValue`'s simple,
pure, three-line logic. Test size values on the two unclaimed pots reverted to null afterward
(they were raw-SQL test artifacts, not real user input); the demo account's real generated plan
from this run was left in place as its clean, presentable latest state.

---

## Feature — accept/reject grow-plan recommendations individually

Requested by the user: "For the garden planner allow the user to accept or reject the growing
planner's recommendations individually, if a user rejects a recommendation a new one should be
generated." Until now a recommendation was fully live the instant a plan was generated — no review
step existed at all. Two product decisions confirmed directly with the user before designing:
rejecting a *grouped* card (identical crop+area-type+size collapsed into one, e.g. "3 x 20cm pots
of Spring Onion") replaces the whole group, not one instance within it; and "accept" is a real
persisted status, not just a cosmetic UI acknowledgment.

Design validated in a review pass before implementation — it caught a real transaction-atomicity
bug in the first draft (the replacement persist step must be one atomic transaction covering all N
instances *and* the old rows' retirement together, or a failure partway through could leave
duplicate live recommendations), a genuine race between a per-recommendation reject and a full-plan
regeneration both claiming the same growing area, and a grouping-key gap that could silently merge
rows of different statuses into one card.

**Schema**: `planRecommendations` gains `status: pending|accepted|regenerating|rejected` (default
`pending`) — new recommendations start awaiting review; `regenerating` is set the instant a reject
is requested, before any AI call, so the UI can show a placeholder immediately; `rejected` rows are
kept, never deleted. Migration backfills every *existing* row to `accepted` rather than leaving the
column default (`pending`) apply to them — they already have committed real-world effects (tasks
scheduled, areas claimed), so from the user's perspective they were implicitly already accepted;
otherwise the whole demo account would suddenly show everything as "unreviewed." `tasks` gains
`planRecommendationId` (nullable FK) — the only existing recommendation→task link was `cropId`,
ambiguous whenever two recommendations in one plan share a crop (exactly the scenario the grouping
feature exists for), so rejecting one of three identical "pot of Spring Onion" recommendations
couldn't otherwise reliably clean up only its own tasks. No new column on `shoppingListItems` — the
existing shopping-list dedup-add is already crop-level, not recommendation-level, and this codebase
never deletes shopping items anywhere, so a rejected recommendation's possibly-still-needed pending
item staying put is consistent with existing behavior, not a new gap.

**New agent** `src/lib/ai/agents/recommendationReplacement.ts` (small dedicated file, matching the
`cropFacts.ts` precedent), resolved via the same `grow_planner` tenant-AI-config slot as the main
planner — same underlying capability, narrower scope, not worth a new configurable slot. Because a
rejected group of N identical-shape recommendations should regenerate as one consistent replacement
(same new crop across all N, so they plausibly re-group afterward), the agent makes one decision
given one representative stage shape plus an `instanceCount`, returning a task *template* keyed by
`activatesStageIndex` (1-based, relative) rather than concrete area ids — the Inngest job replicates
that template across each instance's own real, already-known area ids. One shared reasoning/
harvest-window/task-set applied identically across all N instances is an accepted simplification:
the group already displayed one merged reasoning and widened harvest window *before* rejection, and
the main planner's own harvest-staggering instruction only ever applies across a whole plan, not
within one grouped instance. `buildMockReplacement()` fallback included, matching every other agent.

**New Inngest function** `src/inngest/functions/regenerateRecommendation.ts` (registered in
`/api/inngest/route.ts`), triggered by `recommendation/rejected`. Gathers shared context (profile/
seeds/favorites/dislikes/harvest/catalog, duplicated from `generateGrowPlan.ts` rather than
extracted — the two call sites differ enough that sharing wasn't worth risking proven code for one
reuse) plus each rejected instance's own stage sequence and the plan's other active crops (for
exclusion); calls the agent once; resolves a new-crop backfill if needed (a duplicated single-crop
version of `generateGrowPlan.ts`'s `resolve-new-crops`, same "don't refactor proven code for a
second caller" reasoning); then **one** transaction doing everything: insert all N replacement
instances (recommendations, stages reusing each instance's own already-claimed area ids — no
`growingAreas.status` update needed, they're already correctly `in_use`/`reserved` — and tasks) plus
retire all N old ones (delete their tasks via the new FK, null their stages' `growingAreaId`
mirroring `free-previous-growing-areas`'s exact staleness-prevention pattern, mark them `rejected`).
Single transaction deliberately, not split across steps — a failure partway through a multi-step
version could leave some instances swapped and others not; Postgres rollback makes "all N or none"
free. Failure reverts all N old rows to `pending` with one unconditional update, mirroring
`mark-failed`'s existing shape.

**Race fix**: `free-previous-growing-areas` in the main planner unconditionally frees every claimed
area with no awareness of an in-flight per-recommendation regeneration — a full regenerate racing a
reject could hand the same area to two different new recommendations. Fixed by guarding
`generateGrowPlanAction` (same style as its existing `hasGrowingArea` check) to block if any of the
user's current-plan recommendations is `regenerating`; the UI hides "Generate a new plan" under the
same condition.

**Actions & polling**: `src/lib/actions/recommendations.ts`'s `acceptRecommendationAction`/
`rejectRecommendationAction` do ownership + idempotency + the status flip in one atomic guarded
`UPDATE ... RETURNING` (not a read-then-write, which would race with itself) — `planRecommendations`
has no `userId` column, so ownership is verified via a `growPlanId` subquery against `growPlans`.
New status route `/api/plan-recommendations/[id]/status` mirrors the two existing status routes
exactly; singular, not plural, because the atomic guarded update plus the single-transaction persist
together guarantee every id in a rejected group is always in lockstep, so polling just
`group.recommendationIds[0]` is sufficient.

**UI** (`src/app/grow-plan/page.tsx`): query excludes `rejected`; `groupRecommendations()`'s key
gains `status` (without it, a fresh `pending` replacement from rejecting a *different* group could
silently merge into an already-`accepted` group's card); each card gets Accept/Reject buttons
(`RecommendationActionButtons.tsx`, new); a `regenerating` group renders `RegeneratingCard.tsx`
(new) — a small polling placeholder, deliberately not `JobInterstitial` (now full-screen/page-
blocking by design, disproportionate for one scoped card).

Verified end-to-end against the demo account: generated a real plan, accepted one recommendation
(status flip only, no side effects), rejected two together in one call (simulating a grouped reject
— replicating the actions' exact atomic-update logic in a script, since the real "use server"
actions need an authenticated request context unavailable to a plain script) and confirmed via
Postgres: both replacements landed as the *same* crop (confirming the one-decision-per-group design
worked), each correctly claimed its own original area, each got its own correctly-linked tasks (via
`planRecommendationId`, not accidentally shared), the old recommendations' tasks were fully deleted,
their stages' `growingAreaId` nulled, status `rejected` — and the growing-area status counts stayed
exactly consistent throughout (no orphaned or double-claimed areas). `tsc --noEmit` and `eslint`
clean across the full project. The demo account's resulting state is a fully valid, correctly-
generated outcome (matching exactly what the real UI actions would produce) and was left in place
rather than reverted.

---

## Feature — AI rate limiting (3 grow-plan generations/day, 5 retries per recommendation)

Requested by the user: "Allow the user 3 total growing plan generations per day and a maximum of 5
retries on each grow planner recommendation. Show the user how many attempts they have left." Two
independent budgets against AI spend, layered on top of the full-plan-generation flow and the
reject/regenerate flow (both already built): a daily cap on `generateGrowPlanAction`, and a
per-recommendation cap on how many times the reject → AI-replacement cycle can repeat for one
recommendation "lineage" — a lineage isn't one stable row, it's a chain of rows each superseding the
last (rejecting doesn't mutate a row, it retires it and inserts a fresh replacement).

Design validated in a review pass before implementation. It confirmed the core mechanics (an atomic
`lt(regenerationCount, 5)` guard on the reject path, counting all `growPlans` rows regardless of
status, local-server-time day boundary matching this codebase's one existing "what is today"
convention) and surfaced three gaps, all fixed before shipping: the generate/try-again buttons had
no submit-guard at all — unlike every other action button in this feature — so a double-click or two
open tabs could exceed the daily cap; the recommendation-grouping key didn't include
`regenerationCount`, so two rows that happened to share crop+area+size+status but had diverged retry
counts could in principle land on one card and silently half-fail a reject; and the day-boundary
computation needed to live in one shared place, not be inlined twice.

**Schema**: `planRecommendations` (`src/db/schema/grow-plan.ts`) gains `regenerationCount: integer,
default 0` — depth of the replacement chain that produced a row, not how many times that row itself
was rejected (a row is rejected at most once before being replaced). A fresh recommendation from a
full generation starts at 0; a reject's replacement gets `oldRow.regenerationCount + 1`. Plain
additive migration, no rename ambiguity this time.

**Shared limits/helpers**: `MAX_DAILY_GROW_PLAN_GENERATIONS` (3) and
`MAX_RECOMMENDATION_REGENERATIONS` (5) live in a new `src/lib/ai/limits.ts` — not inline in the
action files, because `"use server"` files may only export async functions (a plain `const` export
there 500s the whole route at runtime, caught during verification, not by `tsc`/`eslint`). New
`startOfTodayLocal()` in `src/lib/dates.ts`, alongside the existing `todayIso()`/`addDaysIso()`.

**Daily cap**: `generateGrowPlanAction` (`src/lib/actions/growPlan.ts`) gets a new exported
`getGrowPlanGenerationsToday(tenantId, userId)` — counts `growPlans` rows for the user with
`createdAt >= startOfTodayLocal()`, all statuses included (the row is inserted, and the Inngest job
dispatched, before success/failure is known, so a retry after a failure still consumes a slot).
Blocks with the same defensive-redirect style as the two existing backstops once the count hits 3;
shared by the page for the displayed remaining count, so the two can't drift. The generate/try-again/
generate-a-new-plan buttons became a client component (`GeneratePlanButton.tsx`, mirroring
`RecommendationActionButtons`'s disable-while-pending shape) — closes the double-submit gap the
review caught; doesn't add server-side locking for the two-open-tabs case, an accepted v1 gap for a
soft usage cap rather than a correctness invariant.

**Retry cap**: `updateOwnedRecommendations` (`src/lib/actions/recommendations.ts`) takes an
`enforceRetryCap` flag; the reject path passes `true`, adding `lt(regenerationCount, 5)` to the same
atomic guarded `UPDATE ... RETURNING` already used for ownership/idempotency — a row already at the
cap is just excluded from `.returning()`, same silent-drop convention as everywhere else in that
function. Accept passes `false`, staying uncapped.
`src/inngest/functions/regenerateRecommendation.ts`'s `Instance` type gained `regenerationCount`
(free — `rejectedRecs` was already a full-row select); the persist step's replacement insert changed
from N identical rows to `instances.map((inst) => ({..., regenerationCount: inst.regenerationCount +
1}))`, using the same `instances[i]` ↔ `newRecs[i]` positional correspondence the step already relied
on for `stageIdByRecAndIndex`.

**UI**: `groupRecommendations()`'s key (`src/app/grow-plan/page.tsx`) gained `regenerationCount`,
same rationale as the existing `status` addition — every row in a displayed group must share one
retry count, since the displayed "N retries left" and the reject guard both depend on it.
`RecommendationActionButtons` gained a `retriesRemaining` prop: shows "N retries left" next to
Reject, replaces the button with "No retries left" at zero. The page shows "N of 3 plan generations
left today" near each generate/try-again button and swaps the button for an informational message
once exhausted.

Verified end-to-end with real Inngest-triggered runs against the demo account (same script-based
testing workaround as other features — server actions need an authenticated request context). Ran
one recommendation through 5 full reject→replace cycles: `regenerationCount` climbed 0→1→2→3→4→5
across five different replacement crops, each old row correctly retired (tasks deleted, stage area
released) before the next replacement landed; the 6th reject attempt returned zero rows from the
atomic guard and left the row untouched at `pending`, exactly as designed. Confirmed the daily-cap
query directly against the account's real history (9 real generations already run today during this
session's testing) — correctly computes 0 remaining and would block a 10th, matching intended
behavior; note this means the demo account is capped for the rest of today as a direct, correct
consequence of dev-testing volume, not a bug. `tsc --noEmit` and `eslint` clean across the full
project; caught and fixed the `"use server"`-export runtime 500 (undetectable by either) during this
pass. Test scripts removed; the demo account's resulting recommendation chain (a real, valid outcome
matching exactly what the UI actions would produce) left in place.

---

## Feature — bias the grow planner toward high-value-to-buy crops

Requested by the user: "let's get the grow planning agent to focus on higher cost to buy fruits and
vegetables that a user could grow as part of the planning, maximise the user's value return." The
global `crops` catalog had no price/cost data anywhere, so neither the main planner nor the reject→
replace agent had any signal to weigh "worth growing yourself" against "cheap to buy anyway." A
clarifying question confirmed the estimate should also show as a visible badge on each
recommendation card, not just live inside the AI's freeform reasoning.

Design validated in a review pass before implementation. It confirmed the full site inventory (2
agents, 2 Inngest jobs, seed data, the UI — no missed third site) and caught: the hand-edited
migration needs `--> statement-breakpoint` between each backfill statement (the migrator splits
files on that literal string — matches the `0017` precedent); the new UI badge shouldn't reuse the
existing "Add to shopping list" pill's styling, since the two very often co-occur on the same card
and would read as a duplicated badge; and £/kg-normalized prices for bunch/packet-sold crops (herbs,
garlic) produce large, odd-looking numbers (e.g. basil ~£35/kg) — mathematically correct as a
ranking signal, flagged with a comment rather than treated as obviously fine.

**Schema**: `crops` (`src/db/schema/crop.ts`) gains `estimatedRetailPricePerKgGbp: real, notNull,
default 0` — the default exists only so the `ADD COLUMN` migration runs non-interactively (no TTY);
every real write path always supplies a real estimate, same pattern as this session's
`regenerationCount`. Migration `0019_abnormal_harry_osborn.sql`: generated `ADD COLUMN` plus 29
hand-added backfill `UPDATE`s (25 curated crops + 4 already-existing unverified AI-added ones —
`seed.ts` only inserts missing slugs, so it wouldn't have retroactively backfilled these), each
separated by `--> statement-breakpoint`. Same 29 values also added to `src/db/seed-data/crops.ts`'s
`CropSeed` entries (own general-knowledge UK-supermarket £/kg estimates, same "approximation, not an
authoritative dataset" spirit as that file's existing figures) so a fresh database seeds correctly.

**Agents**: `cropFacts.ts` (used to backfill any brand-new AI-proposed crop) gained the field in its
output schema, prompt, and mock fallback. `growPlanner.ts`'s shared `AvailableCrop` type gained the
field (picked up automatically by `recommendationReplacement.ts` via its type import); both prompts'
crop-catalog lines now show `est. retail £X.XX/kg`; both got a new INSTRUCTIONS item framing value as
a secondary tie-breaker — prefer the pricier-to-buy crop only when candidates would otherwise suit
the space/season roughly equally well, never overriding genuine fit/season/owned-seeds/favourites/
dislikes. Both mock fallbacks (`buildMockPlan`, `buildMockReplacement`) now sort their non-favorite
candidate pool by price descending, so the deterministic no-API-key path also demonstrates
value-preferring selection, not just favorites-first as before.

**Threading**: both Inngest jobs' (`generateGrowPlan.ts`, `regenerateRecommendation.ts`)
`availableCrops` projections and their resolve-new-crop(s) insert call sites now read/write the new
field — four call sites total, all previously-established duplication (not new).

**UI** (`src/app/grow-plan/page.tsx`): a third pill badge per card — plain text, no emoji, neutral
outline style (`border border-black/15 text-(--text-muted)`, matching `RecommendationActionButtons`'
Reject button rather than reusing the brand-secondary "Add to shopping list" pill, which would
visually collide when both appear on the same card) — `~£X.XX/kg to buy`, shown unconditionally with
a tooltip.

Verified: migration backfill confirmed via Postgres — all 29 existing rows carry real, non-zero
prices (basil highest at £35/kg, carrot lowest at £0.90/kg), matching `seed-data/crops.ts` exactly.
`tsc --noEmit` and `eslint` clean across the full project. A real end-to-end Inngest-triggered
generation was attempted against the demo account to confirm the live model actually responds to the
new tie-breaker instruction (not just the mock path) — both attempts failed on
`generativelanguage.googleapis.com` free-tier quota exhaustion (`limit: 20, model: gemini-3.5-flash`),
a direct consequence of this session's own heavy real-API usage earlier today (9+ full generations,
5 reject cycles, several crop-facts lookups). Forcing the mock path instead wasn't practical either —
this tenant has no `tenant_ai_configs` override row, so the live key comes from the platform-level
`GOOGLE_GENERATIVE_AI_API_KEY` env var, which would need a dev-server restart to unset, too
disruptive for a test. Live-model behavioral confirmation is therefore an open item — recommend a
spot-check (generate a real plan, confirm higher-`estimatedRetailPricePerKgGbp` crops are favoured
among similarly-fitting candidates) once the daily quota resets. Every statically-verifiable piece
(schema, backfill data, prompt wiring, mock sort logic, type-checking) is confirmed correct. No test
artifacts left behind — the two failed test `grow_plans` rows and the throwaway script were removed;
the demo account's latest real (pre-existing) complete plan is unchanged.

---

## Feature — plant-health diagnosis rate limiting (5 checks/day)

Requested by the user: "let's rate the limit the plant health, allow a max of 5 checks per day and
show the remaining usage." Direct continuation of the earlier grow-plan rate-limiting feature — this
closes the other half of the original architecture doc's open question ("simple rate limit on plan
regeneration/diagnosis requests per user per week"), which only got the plan-regeneration half built
at the time. Small enough (no schema change needed — `plantDiagnoses.createdAt` already existed, so
this is purely a counting query, same shape as the grow-plan daily cap) to implement directly rather
than a full planning round.

**Shared limit**: `MAX_DAILY_PLANT_DIAGNOSES = 5` added to `src/lib/ai/limits.ts` alongside the two
existing grow-plan constants. New `getPlantDiagnosesToday(tenantId, userId)` in
`src/lib/actions/plantHealth.ts`, counting `plantDiagnoses` rows with `createdAt >=
startOfTodayLocal()` (reusing the helper built for the grow-plan cap) — all statuses count, same
"the row/job is created before success or failure is known" reasoning as the grow-plan version.

**Two entry points, one shared budget** — both draw against the same daily count: `uploadAndDiagnoseAction`
(upload a new photo + diagnose, on `/plant-health`) checks the cap right after file validation but
*before* the actual storage upload (no point writing a photo for a diagnosis that's about to be
blocked); being a `useActionState`-based action already, going over the cap returns `{error: "..."}`
through its existing inline-error mechanism — no redirect-based workaround needed here, unlike the
grow-plan buttons which didn't have that mechanism. `diagnoseExistingPhotoAction` (re-diagnose an
existing journal photo, on `/journal`) gets the same defensive-backstop-redirect style as the
grow-plan action's checks, redirecting to `/plant-health` (the same target it already redirects to
on success) when over the cap.

**Found and fixed in passing**: `/journal`'s "Diagnose" button had no pending-state guard at all —
a plain `onClick` with no `disabled`, the same double-submit gap the grow-plan buttons had before
last time's fix, just never caught because nothing needed a hard budget behind that button before
now. Added a `diagnosingId` state (mirrors `RecommendationActionButtons`' shape) so the button
disables itself while a diagnosis request is in flight.

**UI**: `/plant-health/page.tsx` shows "N of 5 plant checks left today" under the upload form, and
swaps the whole form out for an informational message once exhausted (matching the grow-plan page's
hide-and-replace pattern). `/journal/page.tsx` computes the same count and passes
`diagnosesRemainingToday` down to `JournalView`; the Diagnose button on each owned photo becomes
"No plant checks left today" (plain text, non-interactive) at zero, instead of just disappearing.

Verified without needing Gemini at all — the cap check runs entirely before any AI call, so a
throwaway script replicated `diagnoseExistingPhotoAction`'s exact count-then-insert logic against
the demo account (0 real diagnoses today going in): 5 inserts allowed, the 6th correctly blocked
with `diagnosesToday() === 5`, matching the cap precisely. `tsc --noEmit` and `eslint` clean across
the full project. Fixture rows (one throwaway `photo_journal_entries` row, five `plant_diagnoses`
rows) and the test script were cleaned up; demo account left with zero plant-diagnosis rows, exactly
as it started.

---

## Feature — week-ahead weather on the dashboard

Requested by the user: "let's show the weather for the week ahead on the dashboard." Weather was
already integrated (`src/lib/weather/index.ts`, Open-Meteo — free, no key, per the original
architecture doc) but only as a single-day fetch feeding the daily 06:00 Inngest job's deterministic
watering-task rules; nothing surfaced weather visually anywhere, and nothing fetched more than one
day out. No schema change needed — `userProfiles.latitude`/`longitude` already existed (resolved
once at onboarding via postcodes.io) and Open-Meteo has no rate/cost concerns worth persisting a
forecast for, so this fetches live on each dashboard load rather than caching anything.

**`getWeeklyForecast(lat, lon, forceScenario?)`** — a new, separate function in the same file
(deliberately not a shared/parameterized version of the existing single-day `getForecast`, matching
this codebase's standing "don't risk a proven code path for reuse" precedent — that one backs a real
task-mutating job, this is purely informational display). Requests `forecast_days=7` with
`weathercode`/`temperature_2m_max`/`temperature_2m_min`/`precipitation_sum`, returns a
`DailyForecast[]`. Reuses the existing `WEATHER_FORCE_SCENARIO` dev-testing override, repeating the
forced single day's numbers across all 7 days (with a representative WMO code per scenario) so local
testing doesn't need live network calls either.

**`src/lib/weather/labels.ts`** (new) — `weatherCodeEmoji`/`weatherCodeLabel`, a direct lookup over
the fixed WMO weather-code enumeration (not a range/bucket helper, since Open-Meteo's codes are a
small fixed set), matching this codebase's existing per-domain `labels.ts` convention
(`plantHealth/labels.ts`, `garden/labels.ts`).

**Shown to every user, not gated to paid** — unlike the AI-powered features, there's no compute cost
to a free API, so this doesn't follow the existing "weather-driven watering-task automation is a
paid-only feature" restriction; that one's gated because it mutates the task list, not because
weather itself is a premium concept.

**UI** (`src/app/dashboard/page.tsx`): new "Weather this week" card, first in the main column (above
"This week" tasks, since forecast context naturally precedes task planning) — 7-day emoji/max-min-
temp/rain-if-any grid, "Today" label on day 0. Fetched via `Promise.all` alongside the existing
`withTenant` data fetch (independent network call, no reason to serialize it after the DB round
trip). Falls back to "Add your postcode to see a forecast" when `latitude`/`longitude` are null
(theoretically rare post-onboarding, since `saveLocationAction` only ever completes onboarding after
a successful geocode) or "Weather is unavailable right now" if the live fetch itself fails.

Verified: fetched the real Open-Meteo response directly for the demo account's postcode (SW1A 1AA →
51.501, -0.1416) and hand-confirmed the JSON shape matches this code's parsing exactly (`daily.time`/
`weathercode`/`temperature_2m_max`/`temperature_2m_min`/`precipitation_sum`, all length-7 arrays);
the returned codes (0, 1, 3) are all covered by the new label map. Found — and fixed as data, not
code — that the demo user's `latitude`/`longitude` were unexpectedly `null` despite having a stored
postcode (leftover from before location resolution existed, or a raw seed insert bypassing
`saveLocationAction`'s atomic postcode+geocode write); backfilled them via postcodes.io's own
resolution for that exact postcode, both correcting stale demo data and exercising the fallback path
for real before fixing it. `tsc --noEmit` and `eslint` clean project-wide; `/dashboard` confirmed to
compile and respond (307 to `/login` unauthenticated, not a 500) via the running dev server.
`getWeeklyForecast` itself couldn't be executed directly in a script — `import "server-only"` throws
unconditionally outside Next's server runtime, not just under webpack bundling as assumed for earlier
features — so this stopped short of a full authenticated browser render (no browser/Playwright tool
available this session); the API-shape verification plus clean typecheck is the practical substitute.
No test artifacts left behind.

---

## Feature — real succession-sowing batches with cancellable series

Requested by the user: "let's work on the succession sowing." Investigation found it was thinner
than it sounded: the grow planner generated at most one extra "re-sow" task per succession-capable
crop, title-only distinguishable from any other task, with no follow-up ever generated beyond that
one — the "continuous harvest" promise in the AI's own task explanation wasn't backed by any real
mechanism. The reject/replace flow's mock fallback didn't even generate that one task. The original
architecture doc planned a real `recurs_every_days`/`series_id` recurring-task concept but it was
never built, and the gap was never documented as a deliberate cut. Presented three scope options
directly to the user (fix the two existing bugs only; generate a real batch of several staggered
re-sows tied by a series id with UI to cancel the remainder as a group; or a full self-perpetuating
chain where completing one task spawns the next) — picked the middle option, fitting this codebase's
existing "AI decides everything at plan-generation time" architecture with no new runtime
task-spawning machinery.

Design was validated in a review pass before implementation. It confirmed the core mechanics
(schema shape, Inngest-replay safety of generating ids inside a `step.run()`, deletion being the
right resolution for "cancel remaining") and surfaced the sharpest gap: grouping succession tasks by
`cropSlug` alone in `generateGrowPlan.ts` could wrongly merge two *separate* recommendations of the
same crop (two different beds) into one series, because tasks in that file carried no link back to
which specific recommendation they belonged to. Fixing that surfaced a real **pre-existing bug**:
`generateGrowPlan.ts` never set `tasks.planRecommendationId` at all (unlike the sibling reject/
replace job) — meaning rejecting an *original*, first-generation recommendation silently left its
tasks behind uncleaned in the calendar, since the cleanup step matches on that column and it was
always null. Both were fixed together, since the same schema addition needed for correct succession
grouping is exactly what closes that bug too.

**Schema**: `tasks` (`src/db/schema/tasks.ts`) gains `successionSeriesId: uuid` — nullable, no FK (a
pure app-generated grouping key via `randomUUID()`), no default, no backfill needed. Plain additive
migration.

**AI schemas**: both agents' `tasks[]` gain `isSuccessionResow: z.boolean()` (required — true only
for a repeat/re-sow occurrence, false for the crop's own first sowing too). `growPlanner.ts` also
gains `recommendationIndex: z.number().int().min(0)` — the 0-based position of a task's owning
recommendation in the array the model is producing in the same response, the fix for the
cross-recommendation merging risk (this flow's tasks are a flat array matched to crops only by
slug; `recommendationReplacement.ts` didn't need this — it only ever proposes one crop/decision per
call, already unambiguous, and its persist step already set `planRecommendationId` correctly per
instance). Task-array caps raised for headroom: `growPlanner.ts` 40→90 (12 recommendations × up to
~7 tasks each worst case), `recommendationReplacement.ts` 10→14.

**Prompts**: replaced "a re-sow task" (singular) with an explicit **hard floor** — always at least 2
re-sow tasks, never just one, up to 5 for a crop with a long outdoor sowing window (4+ months, e.g.
radish/carrot), spaced ~2-3 weeks apart within the season. The first wording tried ("typically 2-5")
was verified against the live model and under-delivered — most succession crops (including radish,
which has a 5-month window) still only got 1 re-sow, essentially the old behavior. Strengthened to
an unconditional floor with an explicit "never just one — defeats the point" framing, re-tested, and
confirmed working (see verification below). Same category of soft-instruction risk flagged for an
earlier feature this session, and this time actually caught it rather than assuming success.

**Mocks**: `buildMockPlan` (growPlanner.ts) — single-task push replaced with a loop generating 3
tasks spaced 14 days apart; every other task literal (7 sites total) got `isSuccessionResow`/
`recommendationIndex`. `buildMockReplacement` (recommendationReplacement.ts) — gained the same loop
where it previously had *no* succession handling at all, closing that inconsistency as a side effect;
every other task literal (6 sites) got `isSuccessionResow: false`. All required zod fields, so `tsc`
caught every missed push site at compile time — confirmed clean on first pass.

**Persist logic** (`generateGrowPlan.ts`): preserved each recommendation's original array index
through the filter/map chain (previously dropped once a recommendation survived or failed
validation), built `Map<originalIndex, planRecommendationId>` from the real inserted rows, and now
resolves both `planRecommendationId` (closing the pre-existing bug) and — for `isSuccessionResow`
tasks — a `Map<planRecommendationId, seriesId>` generating one `randomUUID()` (via `node:crypto`,
matching `src/lib/storage/local.ts`'s import style) the first time a real recommendation is seen,
reused for every later resow sharing it. A task whose `recommendationIndex` points at a
recommendation that didn't survive validation still gets inserted (matches existing tolerance —
tasks were never gated on their recommendation surviving), just with both fields left null.
(`regenerateRecommendation.ts`) — simpler: tasks are already duplicated per instance, so one fresh id
per instance, keeping e.g. "3 pots of Spring Onion" tracking independent succession campaigns rather
than one shared series.

**New action** `cancelSuccessionSeriesAction` (`src/lib/actions/tasks.ts`) — ownership-scoped bulk
delete of `status = 'pending'` tasks sharing a `successionSeriesId`, mirroring `deleteTaskAction`'s
shape, returning removed ids for precise local-state updates. Deletes rather than soft-cancels,
matching the existing precedent (`deleteTaskAction`, and the reject flow's own hard-delete of a
rejected group's tasks) — already-`completed` history is untouched since only `pending` rows match.

**UI**: `CalendarView.tsx` (shared by `/calendar` and the dashboard's "Calendar" card) gained a
"Succession" badge (same style as the existing "Indoor" one) and a "Cancel remaining" button guarded
by `window.confirm` (unlike single-task Delete, this can remove several at once) with an optimistic
local filter. `ThisWeekTasks.tsx` got the badge only — stays a lightweight glance widget, the fuller
Calendar surface is where cancelling lives. Both page-level `.map()` projections threaded the new
field through trivially (both already did untyped `tx.select()`).

**Deliberately not touched**: `weeklyShoppingList.ts` — on reflection its existing one-item-per-crop,
deduped, add-once behavior is already correct here. Succession sowing works from a single seed
packet across every batch (that's the technique's whole point), so multiple resow tasks for the same
crop shouldn't trigger fresh shopping-list entries. What looked like a gap in isolation was already
right once the real feature (several batches from one upfront plan) was considered.

Verified end-to-end against the demo account with the live model (Gemini quota had recovered by this
point in the session): first real run exposed the soft-instruction under-delivery described above
(radish got only 1 resow despite its long window) — caught it rather than assuming the prompt worked,
strengthened the wording, re-ran, and confirmed every succession-capable crop got ≥2 staggered
resows with correct due-date spacing, `plan_recommendation_id` set on all 12/13 tasks in both runs
(0 missing — the pre-existing bug fix confirmed live), and one `succession_series_id` per crop
correctly grouping only that crop's own resows. Directly exercised `cancelSuccessionSeriesAction`'s
logic against real rows: marked one resow completed, cancelled the series, confirmed only the
pending sibling was removed and the completed one was untouched. Replicated the exact
`generateGrowPlan.ts` persist algorithm in an isolated script against a synthetic AI output
containing two separate radish recommendations (two beds) plus one deliberately-invalid recommendation
sandwiched between them (to exercise index-preservation across a drop): confirmed the two beds got
completely independent `succession_series_id`s (never merged), and the dropped recommendation's
tasks still inserted correctly with both `plan_recommendation_id` and `succession_series_id` left
null rather than corrupting either bed's grouping. `tsc --noEmit` and `eslint` clean throughout. All
test scripts and their data removed; the demo account's real successful test generation was left in
place (matching this session's standing precedent) as a valid, presentable outcome.

---

## Feature — extend the Botanical palette, typography, and layout rhythm

Requested: "the UI needs to be more visually appealing whilst being WCAG A+ compliant. Let's use a
colour palette that reflects nature." "WCAG A+" isn't a real conformance level — clarified directly
with the user, who confirmed keeping AA (the existing target) rather than AAA. Also surfaced before
starting: this project already has a documented, WCAG-AA-verified "Botanical" palette pass (Fern/
Marigold/Terracotta/Soil/Linen — see this doc's own "UI/UX & Accessibility Pass" section above) — not
a from-scratch redesign. A second clarifying question narrowed scope to extending the palette further
plus typography/layout rhythm specifically, not the also-offered (not chosen) option of finishing the
previously-deferred button-hover-darkening bug, which remains untouched.

A grep-based audit (every heading, body-text size, card/button/spacing pattern app-wide, not a
stylistic guess) found the existing system already ~95%+ self-consistent once actually measured, so
this was about formalizing what's there and filling real, identified gaps rather than inventing a new
scale: the dominant "heading" pattern app-wide (24 instances) was `<p className="font-medium">` with
no defined size at all; `text-base` was never used anywhere; two competing "heading→content" spacing
conventions existed (`mt-8` on 19 pages vs `mt-6` on 7); primary-button padding alternated `px-6 py-2`
/`px-4 py-2` for equivalent actions; `#1f2a1f`/`#faf8f2` were duplicated as raw hex outside their one
canonical definition; and no SVG icon system existed anywhere (100% of visual interest beyond color/
type came from emoji).

**No browser/screenshot tool was available this session** (unlike the original pass, which used
Playwright) — flagged upfront rather than implying a visual check happened. Verification here is
computed contrast ratios, grep-based completeness checks, and `tsc`/`eslint`; actual visual judgment
is left to the user checking their own running dev server.

**1. Typography**: added **Fraunces** (Google Font, warm/organic serif — a common choice for craft/
farm/wellness brand identities) via `next/font/google` in `src/app/layout.tsx`, alongside the
existing Geist Sans/Mono (kept for body copy — zero migration cost, and Geist reads cleanly on this
app's many data-dense screens). Wired into `globals.css`'s `@theme inline` as `--font-display`, which
automatically produces a `font-display` Tailwind utility the same way `--font-sans` already does.

**2. Heading system**: **h1** (22 real occurrences, not 23 as the earlier audit estimated — corrected
via direct recount, 100% now unified) became `font-display text-3xl font-semibold
text-(--brand-primary)` everywhere (was `text-2xl`, one page already independently at `text-3xl`).
The **24 `font-medium`-only pseudo-headings** were individually reviewed, not blanket-converted — 18
were genuine card/section titles (dashboard cards, grow-plan/plant-health card headlines, admin nav
cards, membership-gate headlines) and became `font-display text-lg font-semibold`, filling the
missing 18px scale step in the same move; 3 were deliberately left untouched because they aren't
headings despite matching the string — a data value (`{Math.round(day.maxTempC)}°`), a dense
list-row label (`EquipmentTypeRow.tsx`), and a compact calendar-widget toolbar label (month/year
between the prev/next buttons). The 5 admin sub-page `<h2>`s gained `font-display` for consistency
with the same size.

**3. Color tokens**: added `--background: #faf8f2` and `--text-heading: #1f2a1f` (closing the raw-hex
duplication in `layout.tsx` + 3 other files — `SiteHeader.tsx`, `UpgradeBanner.tsx`,
`plant-health/page.tsx`'s badge fallback), plus a new `--surface-tint: color-mix(in srgb,
var(--brand-primary) 6%, white)` for empty-state surfaces. Contrast computed before writing any code,
not assumed: `--text-heading` vs `--background` **14.03:1**, vs white **14.9:1**; `--text-muted` on
`--surface-tint` **6.71:1**, `--text-heading` on it **13.66:1** — all comfortably clear of AA (most
near AAA already).

**4. Layout rhythm**: unified the "h1 → content" gap to `mt-8` everywhere (migrated 7 `mt-6` outliers
— 4 admin pages, dashboard ×2, onboarding/crops); unified primary-button padding to `px-6 py-2` (8
outliers found and fixed — turned out `px-6 py-2` was already the majority convention, 15 vs 8, even
among identical `self-start` form-submit buttons, confirming the inconsistency was real rather than
an intentional compact/standalone distinction); fixed the one identified card-padding contradiction
(`plant-health/page.tsx`'s two structurally-identical notice boxes, one `p-6` one `p-4`, aligned to
`p-6`). Left deliberately out of scope: micro-gaps between individual form fields (`gap-2`/`gap-3`/
`gap-4` for similar stacks) — real but low-value, high-diff churn, same "scoped out" precedent the
original accessibility pass used for the hover-state issue.

**5. Nature motif**: new `src/components/LeafAccent.tsx` — a small `currentColor` inline SVG leaf
(no icon-library dependency, matching this codebase's minimal-deps philosophy), applied to 5
representative empty/gate states (dashboard's empty week, calendar's empty day, journal's empty photo
grid, shopping-list's empty list, grow-plan's membership-gate headline) each paired with the new
`--surface-tint` background where structurally appropriate. Deliberately not exhaustive — a bounded,
easily-reviewed set rather than hunting every empty state in the app.

Verified: `tsc --noEmit` and `eslint` clean. Grep-based completeness checks confirmed zero remaining
raw `#1f2a1f`/`#faf8f2` outside their token definitions, zero remaining inconsistent `mt-6`/`px-4
py-2` in the targeted files, and — checked directly rather than trusted from the earlier audit's
estimate — literally 100% of the app's real `<h1>` elements (22/22) now share one definition. Actual
visual review is explicitly handed to the user: no browser tool this session, so "does this look
good" was never claimed as verified, only "is this internally consistent and AA-compliant by the
numbers" — worth a look at `/dashboard`, `/grow-plan`, `/journal`, `/calendar`, and one admin page on
the running dev server before considering this done.
