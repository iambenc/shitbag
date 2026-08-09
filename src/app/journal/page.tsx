import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { photoJournalEntries, users } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { JournalView } from "./JournalView";

export default async function JournalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const { mine, shared } = await withTenant(tenant.id, async (tx) => {
    const [mine, shared] = await Promise.all([
      tx
        .select()
        .from(photoJournalEntries)
        .where(eq(photoJournalEntries.userId, session.user.id))
        .orderBy(desc(photoJournalEntries.createdAt)),
      tx
        .select({ photo: photoJournalEntries, ownerEmail: users.email })
        .from(photoJournalEntries)
        .innerJoin(users, eq(photoJournalEntries.userId, users.id))
        .where(eq(photoJournalEntries.visibility, "shared_tenant"))
        .orderBy(desc(photoJournalEntries.createdAt)),
    ]);
    return { mine, shared };
  });

  const paid = isPaidTier(await getSubscription(session.user.id, tenant.id));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">Photo journal</h1>
      <p className="mt-2 text-sm text-(--text-muted)">Keep a visual record — share what you like.</p>
      <div className="mt-8">
        <JournalView
          tenantName={tenant.displayName}
          currentUserEmail={session.user.email}
          paid={paid}
          myPhotos={mine.map((p) => ({
            id: p.id,
            url: p.url,
            caption: p.caption,
            visibility: p.visibility,
            ownerEmail: session.user.email,
            isOwn: true,
          }))}
          sharedPhotos={shared.map((r) => ({
            id: r.photo.id,
            url: r.photo.url,
            caption: r.photo.caption,
            visibility: r.photo.visibility,
            ownerEmail: r.ownerEmail,
            isOwn: r.photo.userId === session.user.id,
          }))}
        />
      </div>
    </div>
  );
}
