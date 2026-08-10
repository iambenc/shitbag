"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GARDENING_QUOTES } from "@/lib/ai/quotes";

const QUOTE_INTERVAL_MS = 4000;
const POLL_INTERVAL_MS = 2500;

export function JobInterstitial({ statusUrl, message }: { statusUrl: string; message: string }) {
  const router = useRouter();
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const quoteTimer = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % GARDENING_QUOTES.length);
    }, QUOTE_INTERVAL_MS);
    return () => clearInterval(quoteTimer);
  }, []);

  useEffect(() => {
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(statusUrl, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { status: string };
        if (data.status !== "pending") {
          router.refresh();
        }
      } catch {
        // transient network error — the next poll will retry
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(pollTimer);
  }, [statusUrl, router]);

  // Full-screen for the duration of the wait — covers the header/nav too
  // (it has no z-index of its own, so a fixed overlay sits above it
  // unconditionally) so there's no visible way to navigate off before the
  // response lands. Body scroll is locked to match — nothing behind the
  // overlay is reachable either way, but an unlocked page can still scroll
  // underneath, which reads as broken.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white px-6 text-center">
      <span
        className="motion-safe:animate-[grow-pulse_1.8s_ease-in-out_infinite] text-8xl"
        aria-hidden
      >
        🌱
      </span>
      <p className="text-lg font-medium">{message}</p>
      <span className="flex gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-full bg-(--brand-primary) motion-safe:animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      <p className="max-w-md text-sm italic text-(--text-muted)">&ldquo;{GARDENING_QUOTES[quoteIndex]}&rdquo;</p>
    </div>
  );
}
