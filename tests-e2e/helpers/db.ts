import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Direct-SQL test helper for state that has no UI path in this app (there's
 * no self-serve "upgrade to paid" flow to click through — real upgrades go
 * via Stripe checkout, which isn't something a regression pack should be
 * driving). Mirrors the same dev-mode-simulation shape
 * startCheckoutAction uses. Only ever targets pw-test-% accounts (see
 * helpers/auth.ts), never real data.
 */
export async function upgradeToPaid(email: string): Promise<void> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return;
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + 30);
        await tx`
          update subscriptions
          set tier = 'paid', status = 'active', current_period_end = ${periodEnd.toISOString()}
          where user_id = ${users[0].id}
        `;
      });
    }
  } finally {
    await sql.end();
  }
}

/**
 * Inserts one `growingAreas` row at an exact cm position — no UI path for
 * this (the layout canvas only ever writes a position via a real drag,
 * which now snaps to the 15cm grid, or addGrowingAreaFromLayoutAction's
 * own always-unpositioned placement), needed for tests that want an item
 * at a specific spot that isn't reliably reachable by dragging — e.g.
 * right at a plot's far edge, or two footprints touching with an exact
 * 0cm gap when the footprint's own size doesn't divide evenly into the
 * grid (dragging can only land two independently-snapped items exactly
 * edge-to-edge when their width/length is itself a multiple of 15cm).
 * Accepts either a sizeValue+sizeUnit area (a pot/seed tray) or a
 * widthCm+lengthCm one (anything else) — whichever the row's own type
 * actually uses, matching footprintCm's own two branches. Optional
 * heightCm (a structure's own height) and parentGrowingAreaId (placing it
 * inside a structure's own sub-plot — see parentGrowingAreaId on
 * growingAreas) — both nullable/unset by every existing caller, added for
 * garden-structure-nesting.spec.ts. Returns the new row's id (needed to
 * then place something inside a just-created structure).
 */
export async function addGrowingAreaAt(
  email: string,
  params: { type: string; positionXCm: number; positionYCm: number; heightCm?: number; parentGrowingAreaId?: string } & (
    | { sizeValue: number; sizeUnit: "cm" | "litres"; widthCm?: never; lengthCm?: never }
    | { sizeValue?: never; sizeUnit?: never; widthCm: number; lengthCm: number }
  ),
): Promise<string | undefined> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  let newId: string | undefined;
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return;
        const [row] = await tx`
          insert into growing_areas (tenant_id, user_id, type, size_value, size_unit, width_cm, length_cm, height_cm, status, position_x_cm, position_y_cm, parent_growing_area_id)
          values (
            ${tenant.id}, ${users[0].id}, ${params.type},
            ${params.sizeValue ?? null}, ${params.sizeUnit ?? null},
            ${params.widthCm ?? null}, ${params.lengthCm ?? null}, ${params.heightCm ?? null},
            'available', ${params.positionXCm}, ${params.positionYCm}, ${params.parentGrowingAreaId ?? null}
          )
          returning id
        `;
        newId = row.id;
      });
    }
  } finally {
    await sql.end();
  }
  return newId;
}

/**
 * Inserts a `growingAreaEstimations` row already `status: 'complete'` with
 * the given raw AI output, skipping the real photo-upload + Inngest-job
 * pipeline (already exercised elsewhere) so a test can drive straight to
 * `/garden/estimate/{id}` and exercise the review/confirm flow against
 * known, exact proposed data. Returns the new row's id.
 */
export async function addCompletedEstimation(email: string, rawOutput: unknown): Promise<string> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      const id = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return null;
        const [row] = await tx`
          insert into growing_area_estimations (tenant_id, user_id, photo_storage_keys, status, provider, model, raw_output, completed_at)
          values (${tenant.id}, ${users[0].id}, '[]'::jsonb, 'complete', 'mock', 'mock-growing-area-estimator-v1', ${sql.json(rawOutput as Parameters<typeof sql.json>[0])}, now())
          returning id
        `;
        return row.id as string;
      });
      if (id) return id;
    }
    throw new Error(`No tenant found containing user ${email}`);
  } finally {
    await sql.end();
  }
}

/** Reads back a user's growingAreas rows of a given type, for asserting exact stored position/height/rotation values (not just rendered pixels, which go through an extra display-only edge clamp). */
export async function getGrowingAreasByType(
  email: string,
  type: string,
): Promise<
  {
    id: string;
    positionXCm: number | null;
    positionYCm: number | null;
    heightCm: number | null;
    rotationDeg: number;
    parentGrowingAreaId: string | null;
  }[]
> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      const rows = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return null;
        return tx`
          select id, position_x_cm as "positionXCm", position_y_cm as "positionYCm", height_cm as "heightCm", rotation_deg as "rotationDeg", parent_growing_area_id as "parentGrowingAreaId"
          from growing_areas
          where user_id = ${users[0].id} and type = ${type}
        `;
      });
      if (rows)
        return rows as unknown as {
          id: string;
          positionXCm: number | null;
          positionYCm: number | null;
          heightCm: number | null;
          rotationDeg: number;
          parentGrowingAreaId: string | null;
        }[];
    }
    return [];
  } finally {
    await sql.end();
  }
}

/**
 * Marks a crop as "planted" for a user by inserting a minimal, already-
 * `accepted`/`active` grow-plan/recommendation/stage chain directly — the
 * exact shape /harvests's crop dropdown now requires (see
 * src/app/harvests/page.tsx). Bypasses the real (slow, AI-mock-job-backed)
 * generate-plan-then-accept UI flow entirely, since tests that only care
 * about "this user has something planted" shouldn't need to pay that cost
 * or depend on Inngest job timing.
 */
export async function plantCrop(email: string, cropSlug: string): Promise<void> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      const planted = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return false;
        const [crop] = await tx`select id from crops where slug = ${cropSlug}`;
        if (!crop) throw new Error(`No crop found with slug ${cropSlug}`);

        const [growPlan] = await tx`
          insert into grow_plans (tenant_id, user_id, status, completed_at)
          values (${tenant.id}, ${users[0].id}, 'complete', now())
          returning id
        `;
        const [recommendation] = await tx`
          insert into plan_recommendations (tenant_id, grow_plan_id, crop_id, reasoning, status)
          values (${tenant.id}, ${growPlan.id}, ${crop.id}, 'test fixture', 'accepted')
          returning id
        `;
        await tx`
          insert into plan_recommendation_stages (tenant_id, plan_recommendation_id, stage_index, status)
          values (${tenant.id}, ${recommendation.id}, 0, 'active')
        `;
        return true;
      });
      if (planted) return;
    }
    throw new Error(`No tenant found containing user ${email}`);
  } finally {
    await sql.end();
  }
}

/**
 * Inserts a `tasks` row tied to a growing area, matching the exact shape
 * `generateHealthCheckTasksFn` itself inserts — no UI path creates one of
 * these directly (they only ever come from the weekly cron), so tests that
 * want to exercise the "Add photo" flow on an existing task need to seed
 * one this way rather than waiting for/triggering the real cron.
 */
export async function addHealthCheckTask(email: string, growingAreaId: string, title: string): Promise<string> {
  // Uses an explicit JS-computed date (matching src/lib/dates.ts's
  // todayIso, the same local-timezone definition of "today" the app itself
  // and the test browser use) rather than SQL `current_date` — the
  // Postgres session's own timezone can disagree with the local machine's
  // right around midnight, which would otherwise land the row one day off
  // from what the dashboard actually renders as "today's tasks" (the same
  // bug already found and fixed for addWeatherTask in calendar.spec.ts).
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      const id = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return null;
        const [row] = await tx`
          insert into tasks (tenant_id, user_id, title, due_date, source, growing_area_id, status)
          values (${tenant.id}, ${users[0].id}, ${title}, ${todayIso}, 'ai', ${growingAreaId}, 'pending')
          returning id
        `;
        return row.id as string;
      });
      if (id) return id;
    }
    throw new Error(`No tenant found containing user ${email}`);
  } finally {
    await sql.end();
  }
}

/**
 * Inserts a `tasks` row with source: 'weather' and real notes text, matching
 * the shape applyWeatherAdvice.ts itself writes — no UI path creates one of
 * these directly (they only ever come from the daily weather-advice job), so
 * a test that wants to exercise the calendar's weather-impact callout needs
 * to seed one this way rather than waiting for/triggering the real job. Uses
 * an explicit JS-computed date (matching src/lib/dates.ts's todayIso, the
 * same local-timezone definition of "today" the app itself and the test
 * browser use) rather than SQL `current_date` — the Postgres session's own
 * timezone can disagree with the local machine's right around midnight,
 * which would otherwise land the row one day off from what the page
 * actually renders as "today".
 */
export async function addWeatherTask(email: string, title: string, notes: string): Promise<string> {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      const id = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return null;
        const [row] = await tx`
          insert into tasks (tenant_id, user_id, title, notes, due_date, source, status)
          values (${tenant.id}, ${users[0].id}, ${title}, ${notes}, ${todayIso}, 'weather', 'pending')
          returning id
        `;
        return row.id as string;
      });
      if (id) return id;
    }
    throw new Error(`No tenant found containing user ${email}`);
  } finally {
    await sql.end();
  }
}

/**
 * Reads back a user's crop shopping-list items (by crop slug) — used to
 * assert seeds only ever land on the shopping list once a recommendation
 * needing them has actually been accepted, never just from generating (or
 * regenerating) it. No UI path returns crop ids directly, hence direct SQL
 * like every other helper in this file.
 */
export async function getShoppingListCropSlugs(email: string): Promise<string[]> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      const rows = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return null;
        return tx`
          select c.slug
          from shopping_list_items sli
          join crops c on c.id = sli.crop_id
          where sli.user_id = ${users[0].id}
        `;
      });
      if (rows) return rows.map((r) => r.slug as string);
    }
    return [];
  } finally {
    await sql.end();
  }
}

/**
 * Direct-SQL toggle for the community-harvest-popularity opt-in
 * (userProfiles.shareHarvestDataForCommunity) — the real UI path is a single
 * checkbox on /harvests (fast), but tests seeding "another opted-in
 * gardener" as a background account never need to visit that page
 * themselves, matching the direct-SQL-for-background-state convention every
 * other helper in this file already follows.
 */
export async function setShareHarvestData(email: string, share: boolean): Promise<void> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return;
        await tx`update user_profiles set share_harvest_data_for_community = ${share} where user_id = ${users[0].id}`;
      });
    }
  } finally {
    await sql.end();
  }
}

/**
 * Inserts a `harvestLog` row directly, bypassing the real /harvests logging
 * form — used to seed "another opted-in gardener's" harvest history as
 * background state for a test, not the thing under test itself.
 */
export async function addHarvestLogRow(email: string, cropSlug: string, quantity: number, unit: string): Promise<void> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      const inserted = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return false;
        const [crop] = await tx`select id from crops where slug = ${cropSlug}`;
        if (!crop) throw new Error(`No crop found with slug ${cropSlug}`);
        await tx`
          insert into harvest_log (tenant_id, user_id, crop_id, quantity, unit, harvested_at)
          values (${tenant.id}, ${users[0].id}, ${crop.id}, ${quantity}, ${unit}, current_date)
        `;
        return true;
      });
      if (inserted) return;
    }
    throw new Error(`No tenant found containing user ${email}`);
  } finally {
    await sql.end();
  }
}

/**
 * Marks a crop as a liked favorite directly — no UI path drives this in
 * these tests today (the /favourites page isn't otherwise exercised by this
 * pack), and the mock grow planner deterministically recommends favorites
 * first, which is exactly what a test asserting on a specific crop's
 * recommendation needs.
 */
export async function favoriteCrop(email: string, cropSlug: string): Promise<void> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      const inserted = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return false;
        const [crop] = await tx`select id from crops where slug = ${cropSlug}`;
        if (!crop) throw new Error(`No crop found with slug ${cropSlug}`);
        await tx`
          insert into user_favorite_crops (tenant_id, user_id, crop_id, liked)
          values (${tenant.id}, ${users[0].id}, ${crop.id}, true)
        `;
        return true;
      });
      if (inserted) return;
    }
    throw new Error(`No tenant found containing user ${email}`);
  } finally {
    await sql.end();
  }
}
