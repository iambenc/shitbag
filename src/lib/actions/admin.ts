"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { requireTenantAdmin } from "@/lib/actions/shared";
import { encryptSecret } from "@/lib/security/secretBox";
import { CURRENCY_OPTIONS } from "@/lib/actions/adminConstants";
import {
  tenants,
  tenantPlans,
  tenantAIConfigs,
  tenantAIConfigAgentEnum,
  equipmentTypes,
  equipmentCategoryEnum,
  partnerLinks,
  photoJournalEntries,
  photoReports,
} from "@/db/schema";

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #2f6b3c");
const agentSchema = z.enum(tenantAIConfigAgentEnum);
const categorySchema = z.enum(equipmentCategoryEnum);

export type ActionState = { error?: string; success?: boolean };

// --- Branding -------------------------------------------------------------
// `tenants` is the one table with no RLS (resolving tenant is what tells us
// what to scope by), so this deliberately uses the plain `db` client, not
// withTenant() — the sanctioned exception to that rule.
export async function updateBrandingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenantId } = await requireTenantAdmin();

  const displayName = String(formData.get("displayName") || "").trim();
  if (!displayName) return { error: "Display name is required." };

  const primaryColor = hexColorSchema.safeParse(formData.get("primaryColor"));
  const secondaryColor = hexColorSchema.safeParse(formData.get("secondaryColor"));
  if (!primaryColor.success || !secondaryColor.success) {
    return { error: "Colors must be valid hex codes." };
  }

  const logoUrl = String(formData.get("logoUrl") || "").trim() || null;
  const customDomain = String(formData.get("customDomain") || "").trim() || null;

  try {
    await db
      .update(tenants)
      .set({
        displayName,
        logoUrl,
        primaryColor: primaryColor.data,
        secondaryColor: secondaryColor.data,
        customDomain,
      })
      .where(eq(tenants.id, tenantId));
  } catch (err) {
    if (err instanceof Error && err.message.includes("tenants_custom_domain_unique")) {
      return { error: "That custom domain is already in use by another tenant." };
    }
    throw err;
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// --- Billing plan -----------------------------------------------------------
const currencySchema = z.enum(CURRENCY_OPTIONS);

export async function upsertTenantPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenantId } = await requireTenantAdmin();

  const amount = Number(String(formData.get("monthlyAmount") || ""));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid monthly amount." };
  const monthlyAmountPence = Math.round(amount * 100);

  const currencyParsed = currencySchema.safeParse(formData.get("currency"));
  if (!currencyParsed.success) return { error: "Choose a valid currency." };

  const trialDays = Math.max(0, Number.parseInt(String(formData.get("trialDays") || "0"), 10) || 0);
  const stripePriceId = String(formData.get("stripePriceId") || "").trim() || null;

  await withTenant(tenantId, (tx) =>
    tx
      .insert(tenantPlans)
      .values({ tenantId, monthlyAmountPence, currency: currencyParsed.data, trialDays, stripePriceId })
      .onConflictDoUpdate({
        target: tenantPlans.tenantId,
        set: { monthlyAmountPence, currency: currencyParsed.data, trialDays, stripePriceId },
      }),
  );

  revalidatePath("/upgrade");
  revalidatePath("/admin/billing");
  return { success: true };
}

// --- AI provider config -----------------------------------------------------
export async function upsertAIConfigAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenantId } = await requireTenantAdmin();

  const agentParsed = agentSchema.safeParse(formData.get("agent"));
  if (!agentParsed.success) return { error: "Invalid agent." };
  const agent = agentParsed.data;

  const provider = String(formData.get("provider") || "google").trim() || "google";
  const model = String(formData.get("model") || "gemini-3.5-flash").trim() || "gemini-3.5-flash";
  const isActive = formData.get("isActive") === "on";
  const clearKey = formData.get("clearKey") === "on";
  const apiKeyInput = String(formData.get("apiKey") || "").trim();

  // Blank input = leave the stored key unchanged; "clear" explicitly nulls
  // it; a real value replaces it. Never echo a decrypted key back to the UI.
  const apiKeyEncrypted = clearKey ? null : apiKeyInput ? encryptSecret(apiKeyInput) : null;
  const setFields: { provider: string; model: string; isActive: boolean; apiKeyEncrypted?: string | null } = {
    provider,
    model,
    isActive,
  };
  if (clearKey || apiKeyInput) {
    setFields.apiKeyEncrypted = apiKeyEncrypted;
  }

  await withTenant(tenantId, (tx) =>
    tx
      .insert(tenantAIConfigs)
      .values({ tenantId, agent, provider, model, isActive, apiKeyEncrypted })
      .onConflictDoUpdate({
        target: [tenantAIConfigs.tenantId, tenantAIConfigs.agent],
        set: setFields,
      }),
  );

  revalidatePath("/admin/ai");
  return { success: true };
}

// --- Equipment types & partner links -----------------------------------------
export async function createEquipmentTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenantId } = await requireTenantAdmin();

  const slug = String(formData.get("slug") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const categoryParsed = categorySchema.safeParse(formData.get("category"));
  if (!slug || !name || !categoryParsed.success) {
    return { error: "Slug, name, and a valid category are required." };
  }
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") || "0"), 10) || 0;

  try {
    await withTenant(tenantId, (tx) =>
      tx.insert(equipmentTypes).values({ tenantId, slug, name, category: categoryParsed.data, sortOrder }),
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("equipment_types_tenant_slug_unique")) {
      return { error: "That slug is already used by another equipment type." };
    }
    throw err;
  }

  revalidatePath("/admin/equipment");
  return { success: true };
}

export async function updateEquipmentTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenantId } = await requireTenantAdmin();

  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const categoryParsed = categorySchema.safeParse(formData.get("category"));
  if (!id || !name || !categoryParsed.success) {
    return { error: "Name and a valid category are required." };
  }
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") || "0"), 10) || 0;

  await withTenant(tenantId, (tx) =>
    tx.update(equipmentTypes).set({ name, category: categoryParsed.data, sortOrder }).where(eq(equipmentTypes.id, id)),
  );

  revalidatePath("/admin/equipment");
  return { success: true };
}

export async function deleteEquipmentTypeAction(id: string): Promise<void> {
  const { tenantId } = await requireTenantAdmin();
  await withTenant(tenantId, (tx) => tx.delete(equipmentTypes).where(eq(equipmentTypes.id, id)));
  revalidatePath("/admin/equipment");
}

export async function createPartnerLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenantId } = await requireTenantAdmin();

  const equipmentTypeId = String(formData.get("equipmentTypeId") || "");
  const label = String(formData.get("label") || "").trim();
  const url = String(formData.get("url") || "").trim();
  if (!equipmentTypeId || !label || !url) {
    return { error: "Equipment type, label, and URL are required." };
  }
  try {
    new URL(url);
  } catch {
    return { error: "Enter a valid URL." };
  }

  await withTenant(tenantId, (tx) => tx.insert(partnerLinks).values({ tenantId, equipmentTypeId, label, url }));
  revalidatePath("/admin/equipment");
  return { success: true };
}

export async function deletePartnerLinkAction(id: string): Promise<void> {
  const { tenantId } = await requireTenantAdmin();
  await withTenant(tenantId, (tx) => tx.delete(partnerLinks).where(eq(partnerLinks.id, id)));
  revalidatePath("/admin/equipment");
}

// --- Photo report queue -----------------------------------------------------
export async function dismissReportAction(reportId: string): Promise<void> {
  const { tenantId, userId } = await requireTenantAdmin();

  await withTenant(tenantId, (tx) =>
    tx
      .update(photoReports)
      .set({ status: "dismissed", resolvedAt: new Date(), resolvedByUserId: userId })
      .where(and(eq(photoReports.id, reportId), eq(photoReports.status, "pending"))),
  );

  revalidatePath("/admin/reports");
}

// Batched by photo, not by the single report clicked: the photo's visibility
// (the thing actually in dispute) is now settled for every reporter at
// once. Forces the photo private instead of deleting it — a hard delete
// would cascade away the owner's plantDiagnoses too, a strictly bigger loss
// than the actual problem (an unwanted photo in the shared feed) requires.
export async function unsharePhotoFromReportAction(photoJournalEntryId: string): Promise<void> {
  const { tenantId, userId } = await requireTenantAdmin();

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(photoJournalEntries)
      .set({ visibility: "private" })
      .where(eq(photoJournalEntries.id, photoJournalEntryId));

    await tx
      .update(photoReports)
      .set({ status: "actioned", resolvedAt: new Date(), resolvedByUserId: userId })
      .where(and(eq(photoReports.photoJournalEntryId, photoJournalEntryId), eq(photoReports.status, "pending")));
  });

  revalidatePath("/admin/reports");
  revalidatePath("/journal");
}
