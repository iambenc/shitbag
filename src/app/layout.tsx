import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { eq, and } from "drizzle-orm";
import "./globals.css";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { auth, signOut } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/withTenant";
import { tasks } from "@/db/schema";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Warm, organic display serif for headings/card-titles only — body copy
// stays on Geist Sans (clean, neutral, already tuned for this app's
// data-dense screens). See globals.css's @theme for the font-display
// utility this produces.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  return {
    title: `${tenant.displayName} — grow companion`,
    description: `Plan, plant, and track your fruit and veg with ${tenant.displayName}.`,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [tenant, session] = await Promise.all([getCurrentTenant(), auth()]);
  const [subscription, missedTaskCount] = await Promise.all([
    session?.user ? getSubscription(session.user.id, tenant.id) : Promise.resolve(undefined),
    // Header-scoped, not dashboard-scoped — the bell badge needs to be
    // correct on every route, so it's computed here rather than threaded
    // down from a single page. Cheap: an indexed id-only select, same
    // plain-select-then-.length convention used throughout this codebase
    // rather than a SQL count() aggregate.
    session?.user
      ? withTenant(tenant.id, async (tx) => {
          const rows = await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.userId, session.user.id), eq(tasks.status, "missed")));
          return rows.length;
        })
      : Promise.resolve(0),
  ]);
  const isPaid = isPaidTier(subscription);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      style={
        {
          "--brand-primary": tenant.primaryColor,
          "--brand-secondary": tenant.secondaryColor,
        } as React.CSSProperties
      }
    >
      <body
        className="min-h-full flex flex-col bg-(--background) text-(--text-heading)"
        suppressHydrationWarning
      >
        <SiteHeader
          tenant={tenant}
          session={session}
          isPaid={isPaid}
          missedTaskCount={missedTaskCount}
          signOutAction={signOutAction}
        />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
