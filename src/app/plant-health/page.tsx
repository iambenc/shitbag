import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { plantDiagnoses } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { JobInterstitial } from "@/components/JobInterstitial";
import { UploadAndDiagnoseForm } from "./UploadAndDiagnoseForm";

const severityLabels: Record<string, string> = {
  none: "No issue",
  low: "Low severity",
  medium: "Medium severity",
  high: "High severity",
};

// Differentiated by severity so a gardener can tell urgency at a glance,
// not just read it — terracotta only ever pairs with white text (fails
// WCAG AA with dark text), the reverse of the brand-primary tint below.
const severityBadgeClasses: Record<string, string> = {
  none: "bg-(--brand-primary)/15 text-[#1f2a1f]",
  low: "bg-(--brand-primary)/15 text-[#1f2a1f]",
  medium: "bg-(--color-terracotta) text-white",
  high: "bg-red-200 text-red-800",
};

type RawOutput = {
  likelyCauses?: string[];
  careInstructions?: string[];
  explanation?: string;
};

export default async function PlantHealthPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const subscription = await getSubscription(session.user.id, tenant.id);
  const paid = isPaidTier(subscription);

  if (!paid) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-(--brand-primary)">Plant Health</h1>
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6">
          <p className="font-medium">This is a membership feature.</p>
          <p className="mt-2 text-sm text-(--text-muted)">
            Subscribers can upload a photo of a struggling plant and get an AI diagnosis — likely
            causes, severity, and care instructions.
          </p>
          <Link
            href="/upgrade"
            className="mt-4 inline-block rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white hover:opacity-90"
          >
            View membership
          </Link>
        </div>
      </div>
    );
  }

  const diagnoses = await withTenant(tenant.id, async (tx) =>
    tx
      .select()
      .from(plantDiagnoses)
      .where(eq(plantDiagnoses.userId, session.user.id))
      .orderBy(desc(plantDiagnoses.createdAt)),
  );

  const pending = diagnoses.find((d) => d.status === "pending");

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">Plant Health</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Upload a photo of a plant you&rsquo;re worried about for an AI diagnosis.
      </p>

      {pending ? (
        <div className="mt-8">
          <JobInterstitial
            statusUrl={`/api/plant-diagnoses/${pending.id}/status`}
            message="Your plant is being diagnosed…"
          />
        </div>
      ) : (
        <div className="mt-8">
          <UploadAndDiagnoseForm />
        </div>
      )}

      {diagnoses.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          <p className="font-medium">History</p>
          <div className="grid gap-4 lg:grid-cols-2">
          {diagnoses
            .filter((d) => d.status !== "pending")
            .map((d) => {
              if (d.status === "failed") {
                return (
                  <div key={d.id} className="rounded-lg border border-red-200 bg-red-50 p-6">
                    <p className="font-medium text-red-800">Diagnosis failed.</p>
                    {d.errorMessage && <p className="mt-1 text-sm text-red-700">{d.errorMessage}</p>}
                  </div>
                );
              }

              const raw = d.rawOutput as RawOutput | null;
              return (
                <div key={d.id} className="rounded-lg border border-black/10 bg-white p-6">
                  <p className="font-medium">
                    {d.issue}
                    {d.severity && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs ${severityBadgeClasses[d.severity] ?? "bg-(--brand-secondary)/40 text-[#1f2a1f]"}`}
                      >
                        {severityLabels[d.severity] ?? d.severity}
                      </span>
                    )}
                  </p>
                  {raw?.explanation && <p className="mt-2 text-sm text-(--text-muted)">{raw.explanation}</p>}
                  {raw?.likelyCauses && raw.likelyCauses.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-(--text-muted)">Likely causes</p>
                      <ul className="mt-1 list-inside list-disc text-sm text-(--text-muted)">
                        {raw.likelyCauses.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {raw?.careInstructions && raw.careInstructions.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-(--text-muted)">Care instructions</p>
                      <ul className="mt-1 list-inside list-disc text-sm text-(--text-muted)">
                        {raw.careInstructions.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-(--text-muted)">
                    {new Date(d.createdAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
