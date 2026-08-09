"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

const DISMISS_KEY = "edurnity:upgrade-banner-dismissed";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function getSnapshot() {
  return sessionStorage.getItem(DISMISS_KEY) === "1";
}
function getServerSnapshot() {
  return false;
}
function dismiss() {
  sessionStorage.setItem(DISMISS_KEY, "1");
  listeners.forEach((l) => l());
}

// Dismissible for the current browser session only (sessionStorage, not a DB
// column) — reappears next time the user logs in with a fresh session, per
// the spec ("banner displayed when they log in"). useSyncExternalStore (not
// useState+useEffect) is what keeps this SSR-safe: the server and the
// client's first render both use getServerSnapshot (banner visible), so
// there's no hydration mismatch, and the real sessionStorage value syncs in
// right after.
export function UpgradeBanner() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (dismissed) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-lg bg-(--brand-secondary)/25 px-4 py-3 text-sm">
      <p>
        Unlock AI-generated grow plans and weather-aware tasks with a{" "}
        <Link href="/upgrade" className="font-medium underline">
          membership
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-(--text-muted) hover:text-[#1f2a1f]"
      >
        ✕
      </button>
    </div>
  );
}
