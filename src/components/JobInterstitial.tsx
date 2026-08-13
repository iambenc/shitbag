"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingInterstitial } from "@/components/LoadingInterstitial";

const POLL_INTERVAL_MS = 2500;

/**
 * For an async background job with its own status endpoint (Inngest-backed
 * grow-plan generation, growing-area estimation, plant diagnosis) — polls
 * statusUrl and refreshes the page once it's no longer "pending". The
 * full-screen visual itself lives in LoadingInterstitial; a synchronous
 * one-shot call with no job/statusUrl to poll (e.g. the seed packet
 * scanner) should use that directly instead of this wrapper.
 */
export function JobInterstitial({ statusUrl, message }: { statusUrl: string; message: string }) {
  const router = useRouter();

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

  return <LoadingInterstitial message={message} />;
}
