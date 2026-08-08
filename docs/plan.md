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
