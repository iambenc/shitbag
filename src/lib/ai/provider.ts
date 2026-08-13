import "server-only";
import { eq, and } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenantAIConfigs, type TenantAIConfigAgent } from "@/db/schema";
import { decryptSecret } from "@/lib/security/secretBox";

export type AgentName = TenantAIConfigAgent;

/**
 * Per-agent platform default model — not one shared constant, so a genuinely
 * cheap/simple lookup (crop_facts: a handful of planting facts for one crop
 * name, no vision, no complex reasoning) doesn't have to pay for the same
 * tier as agents that need it. growing_area_estimator deliberately stays on
 * the full tier — it needs multimodal/vision support a "lite" tier may not
 * carry. A tenant's explicit tenantAIConfigs.model override always wins
 * over this regardless (see getModelForTenant below) — this is only the
 * fallback when none is set. Also used by admin/ai/page.tsx to show the
 * *actual* default per agent rather than one hardcoded value, so saving
 * that form without touching the Model field can't silently pin every
 * agent to the same model and defeat this.
 */
export const DEFAULT_MODEL_BY_AGENT: Record<AgentName, string> = {
  grow_planner: "gemini-3.5-flash",
  plant_health: "gemini-3.5-flash",
  crop_facts: "gemini-3.5-flash-lite",
  growing_area_estimator: "gemini-3.5-flash",
  weather_advisor: "gemini-3.5-flash",
  // Reading text off a photographed seed packet is a vision task, same tier
  // requirement as growing_area_estimator/plant_health — the lite tier is
  // reserved for text-only lookups like crop_facts.
  seed_packet_scanner: "gemini-3.5-flash",
  maintenance_tasks: "gemini-3.5-flash",
};

/**
 * Resolves the model to use for a given tenant + agent:
 *  1. An active TenantAIConfig row for that tenant/agent, if one has a key.
 *  2. The platform default for that agent (GOOGLE_GENERATIVE_AI_API_KEY env
 *     var, DEFAULT_MODEL_BY_AGENT[agent]).
 *  3. `null` if neither is configured — the caller falls back to a mock provider.
 *
 * tenantAIConfigs is RLS-protected like every other tenant-scoped table, so
 * this goes through withTenant like everything else — an earlier version
 * used the unscoped db client here on the theory that "resolving the model
 * is infrastructure, not user data," which broke in practice: on a pooled
 * connection, once ANY transaction has done `SET LOCAL app.tenant_id`,
 * Postgres registers a permanent placeholder for that custom GUC on the
 * connection, and current_setting(...) returns '' (not NULL) on later
 * unscoped queries — which fails the `::uuid` cast in the RLS policy outright
 * instead of just filtering to zero rows.
 */
export async function getModelForTenant(
  tenantId: string,
  agent: AgentName,
): Promise<{ model: LanguageModel; provider: string; modelId: string } | null> {
  const [config] = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(tenantAIConfigs)
      .where(
        and(
          eq(tenantAIConfigs.tenantId, tenantId),
          eq(tenantAIConfigs.agent, agent),
          eq(tenantAIConfigs.isActive, true),
        ),
      ),
  );

  let tenantKey: string | null = null;
  if (config?.apiKeyEncrypted) {
    try {
      tenantKey = decryptSecret(config.apiKeyEncrypted);
    } catch (err) {
      // Fail soft: a missing/rotated CONFIG_ENCRYPTION_KEY or a corrupted
      // stored value shouldn't take down every tenant's AI feature — fall
      // through to the platform key exactly like "no tenant key configured".
      console.error(`Failed to decrypt tenant_ai_configs key for tenant ${tenantId}/${agent}:`, err);
    }
  }

  const apiKey = tenantKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  const modelId = config?.model || DEFAULT_MODEL_BY_AGENT[agent];
  const google = createGoogleGenerativeAI({ apiKey });
  return { model: google(modelId), provider: config?.provider ?? "google", modelId };
}
