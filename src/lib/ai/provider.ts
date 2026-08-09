import "server-only";
import { eq, and } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenantAIConfigs, type TenantAIConfigAgent } from "@/db/schema";
import { decryptSecret } from "@/lib/security/secretBox";

export type AgentName = TenantAIConfigAgent;

/**
 * Resolves the model to use for a given tenant + agent:
 *  1. An active TenantAIConfig row for that tenant/agent, if one has a key.
 *  2. The platform default (GOOGLE_GENERATIVE_AI_API_KEY env var, gemini-3.5-flash).
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

  const modelId = config?.model || "gemini-3.5-flash";
  const google = createGoogleGenerativeAI({ apiKey });
  return { model: google(modelId), provider: config?.provider ?? "google", modelId };
}
