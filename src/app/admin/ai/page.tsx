import { withTenant } from "@/lib/tenant/withTenant";
import { tenantAIConfigs, tenantAIConfigAgentEnum } from "@/db/schema";
import { requireTenantAdmin } from "@/lib/actions/shared";
import { AIConfigForm } from "./AIConfigForm";

const AGENT_LABELS: Record<string, string> = {
  grow_planner: "Grow planner",
  plant_health: "Plant health diagnosis",
  crop_facts: "Crop facts lookup",
};

export default async function AdminAIPage() {
  const { tenantId } = await requireTenantAdmin();

  const rows = await withTenant(tenantId, (tx) => tx.select().from(tenantAIConfigs));
  const byAgent = new Map(rows.map((r) => [r.agent, r]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h2 className="font-display text-lg font-semibold">AI providers</h2>
        <p className="mt-1 text-sm text-(--text-muted)">
          Configure a per-tenant API key for each AI agent. Leaving this unset falls back to the
          platform&rsquo;s own key.
        </p>
      </div>
      {tenantAIConfigAgentEnum.map((agent) => {
        const config = byAgent.get(agent);
        return (
          <div key={agent}>
            <h3 className="font-medium">{AGENT_LABELS[agent] ?? agent}</h3>
            <div className="mt-3">
              <AIConfigForm
                agent={agent}
                config={{
                  provider: config?.provider ?? "google",
                  model: config?.model ?? "gemini-3.5-flash",
                  isActive: config?.isActive ?? true,
                  configured: Boolean(config?.apiKeyEncrypted),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
