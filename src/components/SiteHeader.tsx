"use client";

import { useState } from "react";
import Link from "next/link";
import { MenuIcon, CloseIcon } from "@/components/icons";

type Session = { user: { email: string; role: string } } | null;
type Tenant = { displayName: string; logoUrl: string | null };

function NavItems({
  session,
  isPaid,
  signOutAction,
  onNavigate,
}: {
  session: Session;
  isPaid: boolean;
  signOutAction: () => Promise<void>;
  onNavigate?: () => void;
}) {
  if (!session?.user) {
    return (
      <>
        <Link href="/login" className="hover:underline" onClick={onNavigate}>
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-(--brand-primary) px-4 py-1.5 text-white shadow-button hover:brightness-90 active:scale-95 transition"
          onClick={onNavigate}
        >
          Sign up
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/dashboard" className="hover:underline" onClick={onNavigate}>
        Dashboard
      </Link>
      <Link href="/garden" className="hover:underline" onClick={onNavigate}>
        My Garden
      </Link>
      <Link href="/journal" className="hover:underline" onClick={onNavigate}>
        Garden Journal
      </Link>
      {!isPaid && (
        <Link
          href="/upgrade"
          className="rounded-full bg-(--brand-secondary) px-3 py-1 font-medium text-(--text-heading) hover:brightness-90 active:scale-95 transition"
          onClick={onNavigate}
        >
          Upgrade
        </Link>
      )}
      {session.user.role === "tenant_admin" && (
        <Link href="/admin" className="hover:underline" onClick={onNavigate}>
          Admin
        </Link>
      )}
      <span className="max-w-[180px] truncate text-(--text-muted)" title={session.user.email}>
        {session.user.email}
      </span>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-full border border-(--brand-primary)/30 px-3 py-1 hover:bg-(--brand-primary)/10"
        >
          Sign out
        </button>
      </form>
    </>
  );
}

export function SiteHeader({
  tenant,
  session,
  isPaid,
  signOutAction,
}: {
  tenant: Tenant;
  session: Session;
  isPaid: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b border-(--brand-primary)/15 bg-(--background)/90 shadow-card backdrop-blur-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-(--brand-primary)">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-admin-supplied logo URL, not a local static asset
            <img src={tenant.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
          ) : (
            <span aria-hidden>🌱</span>
          )}
          {tenant.displayName}
        </Link>

        <nav className="hidden items-center gap-4 text-sm md:flex">
          <NavItems session={session} isPaid={isPaid} signOutAction={signOutAction} />
        </nav>

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
      </div>

      {open && (
        <nav id="mobile-nav" className="flex flex-col items-start gap-3 border-t border-(--brand-primary)/15 px-6 py-4 text-sm md:hidden">
          <NavItems session={session} isPaid={isPaid} signOutAction={signOutAction} onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </header>
  );
}
