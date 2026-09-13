"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, CloseIcon, DashboardIcon, GardenIcon, ShedIcon, JournalIcon, CalendarIcon, BellIcon } from "@/components/icons";
import { UserMenu } from "@/components/UserMenu";

type Session = { user: { email: string; role: string } } | null;
type Tenant = { displayName: string; logoUrl: string | null };

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/garden", label: "My Garden", icon: GardenIcon },
  { href: "/my-shed", label: "My Shed", icon: ShedIcon },
  { href: "/journal", label: "Garden Journal", icon: JournalIcon },
  { href: "/calendar", label: "My Calendar", icon: CalendarIcon },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavPills({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-(--brand-primary) text-white shadow-button"
                : "text-(--text-heading) hover:bg-(--brand-primary)/10"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function SiteHeader({
  tenant,
  session,
  isPaid,
  missedTaskCount,
  signOutAction,
}: {
  tenant: Tenant;
  session: Session;
  isPaid: boolean;
  missedTaskCount: number;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-40 border-b border-(--brand-primary)/15 bg-(--background)/90 shadow-card backdrop-blur-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-(--brand-primary)">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-admin-supplied logo URL, not a local static asset
            <img src={tenant.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
          ) : (
            <span aria-hidden>🌱</span>
          )}
          {tenant.displayName}
        </Link>

        {session?.user && (
          <nav className="hidden items-center gap-1 md:flex">
            <NavPills pathname={pathname} />
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {session?.user && (
            <Link
              href="/calendar"
              aria-label={missedTaskCount > 0 ? `${missedTaskCount} missed task${missedTaskCount === 1 ? "" : "s"}` : "Notifications"}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-(--brand-primary)/10 transition"
            >
              <BellIcon className="h-5 w-5 text-(--text-heading)" />
              {missedTaskCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-terracotta) px-1 text-[10px] font-medium text-white">
                  {missedTaskCount > 9 ? "9+" : missedTaskCount}
                </span>
              )}
            </Link>
          )}

          <div className="hidden md:block">
            <UserMenu session={session} isPaid={isPaid} signOutAction={signOutAction} />
          </div>

          {session?.user && (
            <button
              type="button"
              className="rounded-md border border-(--brand-primary)/30 p-1.5 md:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          )}

          {!session?.user && (
            <div className="md:hidden">
              <UserMenu session={session} isPaid={isPaid} signOutAction={signOutAction} />
            </div>
          )}
        </div>
      </div>

      {open && session?.user && (
        <nav id="mobile-nav" className="flex flex-col items-stretch gap-1 border-t border-(--brand-primary)/15 px-4 py-3 text-sm md:hidden">
          <NavPills pathname={pathname} onNavigate={() => setOpen(false)} />
          <div className="mt-2 border-t border-(--brand-primary)/15 pt-2">
            <UserMenu session={session} isPaid={isPaid} signOutAction={signOutAction} />
          </div>
        </nav>
      )}
    </header>
  );
}
