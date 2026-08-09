import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { auth, signOut } from "@/lib/auth";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={
        {
          "--brand-primary": tenant.primaryColor,
          "--brand-secondary": tenant.secondaryColor,
        } as React.CSSProperties
      }
    >
      <body
        className="min-h-full flex flex-col bg-[#faf8f2] text-[#1f2a1f]"
        suppressHydrationWarning
      >
        <header className="flex items-center justify-between border-b border-(--brand-primary)/15 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-(--brand-primary)">
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- tenant-admin-supplied logo URL, not a local static asset
              <img src={tenant.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
            ) : (
              <span aria-hidden>🌱</span>
            )}
            {tenant.displayName}
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {session?.user ? (
              <>
                <Link href="/dashboard" className="hover:underline">
                  Dashboard
                </Link>
                <Link href="/garden" className="hover:underline">
                  My Garden
                </Link>
                {!isPaid && (
                  <Link
                    href="/upgrade"
                    className="rounded-full bg-(--brand-secondary) px-3 py-1 font-medium text-[#1f2a1f] hover:opacity-90"
                  >
                    Upgrade
                  </Link>
                )}
                {session.user.role === "tenant_admin" && (
                  <Link href="/admin" className="hover:underline">
                    Admin
                  </Link>
                )}
                <span className="text-[#1f2a1f]/60">{session.user.email}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-full border border-(--brand-primary)/30 px-3 py-1 hover:bg-(--brand-primary)/10"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="hover:underline">
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-(--brand-primary) px-4 py-1.5 text-white hover:opacity-90"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
