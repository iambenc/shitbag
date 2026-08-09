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

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-black/10 bg-white px-6 py-16 text-center">
      <span className="text-4xl" aria-hidden>
        🌱
      </span>
      <p className="font-medium">{message}</p>
      <p className="max-w-md text-sm italic text-(--text-muted)">&ldquo;{GARDENING_QUOTES[quoteIndex]}&rdquo;</p>
    </div>
  );
}
