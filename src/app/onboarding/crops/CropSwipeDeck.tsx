"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, type PanInfo, type Variants } from "framer-motion";
import { setCropPreferenceAction } from "@/lib/actions/crops";
import { nextOnboardingStep } from "@/lib/onboarding/steps";

type CropCard = { id: string; name: string; emoji: string; category: string };

const SWIPE_THRESHOLD = 100;

const cardVariants: Variants = {
  center: { x: 0, opacity: 1, rotate: 0, scale: 1 },
  exit: (direction: "left" | "right") => ({
    x: direction === "right" ? 300 : -300,
    rotate: direction === "right" ? 15 : -15,
    opacity: 0,
  }),
};

export function CropSwipeDeck({ crops }: { crops: CropCard[] }) {
  const [queue, setQueue] = useState(crops);
  const [exitDirection, setExitDirection] = useState<"left" | "right">("left");
  const current = queue[0];

  function decide(liked: boolean) {
    if (!current) return;
    setExitDirection(liked ? "right" : "left");
    setCropPreferenceAction(current.id, liked).catch((err) => {
      console.error("Failed to record crop preference", err);
    });
    setQueue((q) => q.slice(1));
  }

  function handleDragEnd(_event: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) decide(true);
    else if (info.offset.x < -SWIPE_THRESHOLD) decide(false);
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg font-medium">That&apos;s everything!</p>
        <Link
          href={nextOnboardingStep("crops")}
          className="rounded-full bg-(--brand-primary) px-6 py-2 text-white shadow-button hover:brightness-90 active:scale-95 transition"
        >
          Continue
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-(--text-muted)">{queue.length} left</p>
      <div className="relative h-72 w-full max-w-xs">
        <AnimatePresence custom={exitDirection}>
          <motion.div
            key={current.id}
            custom={exitDirection}
            variants={cardVariants}
            initial="center"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={handleDragEnd}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 flex cursor-grab flex-col items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white p-6 shadow-lg active:cursor-grabbing"
          >
            <span className="text-6xl" aria-hidden>
              {current.emoji}
            </span>
            <span className="text-xl font-semibold">{current.name}</span>
            <span className="text-xs uppercase tracking-wide text-(--text-muted)">
              {current.category}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex gap-6">
        <button
          type="button"
          onClick={() => decide(false)}
          aria-label={`Not interested in ${current.name}`}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-black/5 text-2xl hover:bg-black/10 active:scale-95 transition"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => decide(true)}
          aria-label={`Favourite ${current.name}`}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-(--brand-primary) text-2xl text-white shadow-button hover:brightness-90 active:scale-95 transition"
        >
          ♥
        </button>
      </div>
    </div>
  );
}
