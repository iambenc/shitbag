import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { photoJournalEntries, users, growingAreas, harvestLog, crops, cropVarieties, gardenNotes } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { getPlantDiagnosesToday } from "@/lib/actions/plantHealth";
import { MAX_DAILY_PLANT_DIAGNOSES } from "@/lib/ai/limits";
import { growingAreaBaseLabel } from "@/lib/garden/labels";
import { JournalView } from "./JournalView";
import type { JournalEntry, SharedPhoto } from "./types";

export default async function JournalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const { mine, shared, allHarvests, myNotes, sharedNotes, myGrowingAreas } = await withTenant(tenant.id, async (tx) => {
    const [mine, shared, allHarvests, myNotes, sharedNotes, myGrowingAreas] = await Promise.all([
      tx
        .select({ photo: photoJournalEntries, area: growingAreas, harvest: harvestLog, crop: crops, variety: cropVarieties })
        .from(photoJournalEntries)
        .leftJoin(growingAreas, eq(photoJournalEntries.growingAreaId, growingAreas.id))
        .leftJoin(harvestLog, eq(photoJournalEntries.harvestLogId, harvestLog.id))
        .leftJoin(crops, eq(harvestLog.cropId, crops.id))
        .leftJoin(cropVarieties, eq(harvestLog.varietyId, cropVarieties.id))
        .where(eq(photoJournalEntries.userId, session.user.id))
        .orderBy(desc(photoJournalEntries.createdAt)),
      tx
        .select({
          photo: photoJournalEntries,
          ownerEmail: users.email,
          area: growingAreas,
          harvest: harvestLog,
          crop: crops,
          variety: cropVarieties,
        })
        .from(photoJournalEntries)
        .innerJoin(users, eq(photoJournalEntries.userId, users.id))
        .leftJoin(growingAreas, eq(photoJournalEntries.growingAreaId, growingAreas.id))
        .leftJoin(harvestLog, eq(photoJournalEntries.harvestLogId, harvestLog.id))
        .leftJoin(crops, eq(harvestLog.cropId, crops.id))
        .leftJoin(cropVarieties, eq(harvestLog.varietyId, cropVarieties.id))
        .where(eq(photoJournalEntries.visibility, "shared_tenant"))
        .orderBy(desc(photoJournalEntries.createdAt)),
      // ALL of the user's harvests, not just photo-linked ones — a harvest
      // logged with no photo (addHarvestAction fully supports this) still
      // needs a Timeline/Harvests-tab presence, see the merge below.
      tx
        .select({ harvest: harvestLog, crop: crops, variety: cropVarieties })
        .from(harvestLog)
        .innerJoin(crops, eq(harvestLog.cropId, crops.id))
        .leftJoin(cropVarieties, eq(harvestLog.varietyId, cropVarieties.id))
        .where(eq(harvestLog.userId, session.user.id))
        .orderBy(desc(harvestLog.harvestedAt)),
      tx
        .select({ note: gardenNotes, area: growingAreas })
        .from(gardenNotes)
        .leftJoin(growingAreas, eq(gardenNotes.growingAreaId, growingAreas.id))
        .where(eq(gardenNotes.userId, session.user.id))
        .orderBy(desc(gardenNotes.createdAt)),
      tx
        .select({ note: gardenNotes, ownerEmail: users.email, area: growingAreas })
        .from(gardenNotes)
        .innerJoin(users, eq(gardenNotes.userId, users.id))
        .leftJoin(growingAreas, eq(gardenNotes.growingAreaId, growingAreas.id))
        .where(eq(gardenNotes.visibility, "shared_tenant"))
        .orderBy(desc(gardenNotes.createdAt)),
      tx.select().from(growingAreas).where(eq(growingAreas.userId, session.user.id)),
    ]);
    return { mine, shared, allHarvests, myNotes, sharedNotes, myGrowingAreas };
  });

  const paid = isPaidTier(await getSubscription(session.user.id, tenant.id));
  const diagnosesToday = await getPlantDiagnosesToday(tenant.id, session.user.id);
  const diagnosesRemainingToday = Math.max(0, MAX_DAILY_PLANT_DIAGNOSES - diagnosesToday);

  const photoEntries: JournalEntry[] = mine.map((r) => ({
    id: r.photo.id,
    kind: r.harvest ? "harvest" : "photo",
    dateIso: r.photo.createdAt.toISOString(),
    photoId: r.photo.id,
    photoUrl: r.photo.url,
    caption: r.photo.caption,
    visibility: r.photo.visibility,
    harvestId: r.harvest?.id ?? null,
    noteId: null,
    cropId: r.harvest?.cropId ?? null,
    cropName: r.crop?.name ?? null,
    cropEmoji: r.crop?.emoji ?? null,
    varietyName: r.variety?.name ?? null,
    quantity: r.harvest?.quantity ?? null,
    unit: r.harvest?.unit ?? null,
    notes: r.harvest?.notes ?? null,
    areaLabel: r.area ? growingAreaBaseLabel(r.area) : null,
  }));

  // Only harvests with no photo at all get their own Timeline entry here —
  // ones that do have a photo are already represented above (photoEntries),
  // one row per photo, never duplicated.
  const photoHarvestIds = new Set(photoEntries.map((e) => e.harvestId).filter((id): id is string => Boolean(id)));
  const harvestOnlyEntries: JournalEntry[] = allHarvests
    .filter((r) => !photoHarvestIds.has(r.harvest.id))
    .map((r) => ({
      id: r.harvest.id,
      kind: "harvest",
      dateIso: r.harvest.harvestedAt,
      photoId: null,
      photoUrl: null,
      caption: null,
      visibility: null,
      harvestId: r.harvest.id,
      noteId: null,
      cropId: r.harvest.cropId,
      cropName: r.crop.name,
      cropEmoji: r.crop.emoji,
      varietyName: r.variety?.name ?? null,
      quantity: r.harvest.quantity,
      unit: r.harvest.unit,
      notes: r.harvest.notes,
      areaLabel: null,
    }));

  // A note's body is stored directly in the shared `caption` field — every
  // other JournalEntry consumer (EntryCard's title, etc.) already renders
  // `caption` correctly, so a note needs no dedicated display field of its
  // own.
  const noteEntries: JournalEntry[] = myNotes.map((r) => ({
    id: r.note.id,
    kind: "note",
    dateIso: r.note.createdAt.toISOString(),
    photoId: null,
    photoUrl: null,
    caption: r.note.body,
    visibility: r.note.visibility,
    harvestId: null,
    noteId: r.note.id,
    cropId: null,
    cropName: null,
    cropEmoji: null,
    varietyName: null,
    quantity: null,
    unit: null,
    notes: null,
    areaLabel: r.area ? growingAreaBaseLabel(r.area) : null,
  }));

  const entries = [...photoEntries, ...harvestOnlyEntries, ...noteEntries].sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const sharedPhotoEntries = shared.map((r) => ({
    createdAt: r.photo.createdAt,
    item: {
      id: r.photo.id,
      url: r.photo.url,
      body: null,
      caption: r.photo.caption,
      ownerEmail: r.ownerEmail,
      isOwn: r.photo.userId === session.user.id,
      tagLabel: r.area ? growingAreaBaseLabel(r.area) : r.crop ? `${r.crop.emoji} ${r.crop.name}` : null,
    } satisfies SharedPhoto,
  }));
  const sharedNoteEntries = sharedNotes.map((r) => ({
    createdAt: r.note.createdAt,
    item: {
      id: r.note.id,
      url: null,
      body: r.note.body,
      caption: null,
      ownerEmail: r.ownerEmail,
      isOwn: r.note.userId === session.user.id,
      tagLabel: r.area ? growingAreaBaseLabel(r.area) : null,
    } satisfies SharedPhoto,
  }));
  const sharedPhotos: SharedPhoto[] = [...sharedPhotoEntries, ...sharedNoteEntries]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => r.item);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <JournalView
        tenantName={tenant.displayName}
        currentUserEmail={session.user.email}
        paid={paid}
        diagnosesRemainingToday={diagnosesRemainingToday}
        growingAreaOptions={myGrowingAreas.map((a) => ({ id: a.id, label: growingAreaBaseLabel(a) }))}
        initialEntries={entries}
        initialSharedPhotos={sharedPhotos}
      />
    </div>
  );
}
