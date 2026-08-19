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
 * actually uses, matching footprintCm's own two branches.
 */
export async function addGrowingAreaAt(
  email: string,
  params: { type: string; positionXCm: number; positionYCm: number } & (
    | { sizeValue: number; sizeUnit: "cm" | "litres"; widthCm?: never; lengthCm?: never }
    | { sizeValue?: never; sizeUnit?: never; widthCm: number; lengthCm: number }
  ),
): Promise<void> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return;
        await tx`
          insert into growing_areas (tenant_id, user_id, type, size_value, size_unit, width_cm, length_cm, status, position_x_cm, position_y_cm)
          values (
            ${tenant.id}, ${users[0].id}, ${params.type},
            ${params.sizeValue ?? null}, ${params.sizeUnit ?? null},
            ${params.widthCm ?? null}, ${params.lengthCm ?? null},
            'available', ${params.positionXCm}, ${params.positionYCm}
          )
        `;
      });
    }
  } finally {
    await sql.end();
  }
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
  { id: string; positionXCm: number | null; positionYCm: number | null; heightCm: number | null; rotationDeg: number }[]
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
          select id, position_x_cm as "positionXCm", position_y_cm as "positionYCm", height_cm as "heightCm", rotation_deg as "rotationDeg"
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
        }[];
    }
    return [];
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
