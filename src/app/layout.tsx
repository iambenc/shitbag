import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { auth, signOut } from "@/lib/auth";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { SiteHeader } from "@/components/SiteHeader";

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
  const subscription = session?.user
    ? await getSubscription(session.user.id, tenant.id)
    : undefined;
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
        <SiteHeader tenant={tenant} session={session} isPaid={isPaid} signOutAction={signOutAction} />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
