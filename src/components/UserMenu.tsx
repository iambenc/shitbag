"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "@/components/icons";

type Session = { user: { email: string; role: string } } | null;

// Avatar-chip + dropdown absorbing what used to sit inline in SiteHeader's
// desktop nav row (Upgrade/Admin/email/Sign out) — pulled out into its own
// small popover to match the mockup's avatar-chip pattern, and to keep
// SiteHeader itself focused on the pill nav.
export function UserMenu({
  session,
  isPaid,
  signOutAction,
}: {
  session: Session;
  isPaid: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!session?.user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <Link href="/login" className="hover:underline">
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-(--brand-primary) px-4 py-1.5 text-white shadow-button hover:brightness-90 active:scale-95 transition"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const initial = session.user.email.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm hover:bg-(--brand-primary)/10 transition"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--brand-primary) font-medium text-white">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate lg:inline" title={session.user.email}>
          {session.user.email}
        </span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-(--text-muted) transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        // Plain buttons/links, not role="menu"/"menuitem" — this codebase
        // doesn't implement full ARIA-menu keyboard behavior (arrow-key
        // roving tabindex etc.) anywhere else, so claiming that role here
        // without the interaction to back it would be a worse experience
        // for assistive tech than just letting each item keep its natural
        // implicit role (link/button).
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-black/10 bg-white p-1.5 shadow-card">
          <p className="truncate px-3 py-1.5 text-xs text-(--text-muted) lg:hidden" title={session.user.email}>
            {session.user.email}
          </p>
          {!isPaid && (
            <Link
              href="/upgrade"
              onClick={() => setOpen(false)}
              className="block rounded-md bg-(--brand-secondary) px-3 py-2 text-sm font-medium text-(--text-heading) hover:brightness-90 transition"
            >
              Upgrade
            </Link>
          )}
          {session.user.role === "tenant_admin" && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm hover:bg-(--brand-primary)/10 transition"
            >
              Admin
            </Link>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-(--brand-primary)/10 transition"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
