import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { growingAreaEstimations } from "@/db/schema";
import { GrowingAreaEstimationOutputSchema } from "@/lib/ai/agents/growingAreaEstimator";
import { JobInterstitial } from "@/components/JobInterstitial";
import { EstimationReviewForm } from "./EstimationReviewForm";

export default async function EstimationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const tenant = await getCurrentTenant();

  const estimation = await withTenant(tenant.id, async (tx) => {
    const [row] = await tx.select().from(growingAreaEstimations).where(eq(growingAreaEstimations.id, id));
    return row;
  });

  if (!estimation || estimation.userId !== session.user.id) notFound();

  // Shown in-place, not bounced to the index page — uploadPhotosForEstimationAction
  // redirects here immediately after inserting the row, while the Inngest
  // job (a real Gemini call, ~10s) is still in flight, so "pending" is the
  // normal first render here, not an edge case. JobInterstitial polls this
  // same id's status and calls router.refresh() once it resolves, which
  // re-renders this same page/URL into the actual review content below —
  // the user never has to know or care this page redirected away and back.
  if (estimation.status === "pending") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Review your estimate</h1>
        <div className="mt-8">
          <JobInterstitial
            statusUrl={`/api/growing-area-estimations/${estimation.id}/status`}
            message="Looking at your photos…"
          />
        </div>
      </div>
    );
  }

  if (estimation.status === "failed") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Estimate from photos</h1>
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-800">That estimate failed.</p>
          <p className="mt-1 text-sm text-red-700">Please come back later and try again.</p>
        </div>
        <Link href="/garden/estimate" className="mt-4 inline-block text-sm text-(--brand-primary) underline">
          Try again
        </Link>
      </div>
    );
  }

  if (estimation.appliedAt) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Estimate from photos</h1>
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
          <p className="text-sm text-(--text-muted)">
            This estimate has already been added to your garden.
          </p>
        </div>
        <Link href="/garden" className="mt-4 inline-block text-sm text-(--brand-primary) underline">
          Go to your garden
        </Link>
      </div>
    );
  }

  // Parsed, not just cast — this is jsonb with no DB-level shape guarantee,
  // and (unlike plantDiagnoses.rawOutput, which is only ever displayed) it
  // flows straight into an editable form here.
  const parsed = GrowingAreaEstimationOutputSchema.safeParse(estimation.rawOutput);
  if (!parsed.success) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Estimate from photos</h1>
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-800">Something went wrong reading this estimate.</p>
          <p className="mt-1 text-sm text-red-700">Please try again.</p>
        </div>
        <Link href="/garden/estimate" className="mt-4 inline-block text-sm text-(--brand-primary) underline">
          Try again
        </Link>
      </div>
    );
  }

  const photoUrls = (estimation.photoUrls as string[] | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Review your estimate</h1>
      <p className="mt-2 text-sm text-(--text-muted)">{parsed.data.summary}</p>
      <p className="mt-1 text-xs text-(--text-muted)">
        Edit anything that looks off, remove what isn&rsquo;t right, or add areas the photos missed —
        nothing is added to your garden until you confirm.
      </p>

      {photoUrls.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium text-(--text-muted)">What the AI looked at</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photoUrls.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-black/10 shadow-card hover:border-(--brand-primary)/40 transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */}
                <img src={url} alt={`Uploaded photo ${i + 1}`} className="aspect-square w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <EstimationReviewForm estimationId={estimation.id} proposedAreas={parsed.data.areas} />
      </div>
    </div>
  );
}
