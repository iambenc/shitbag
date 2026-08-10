"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Thin client wrapper so server-rendered cards (dashboard, grow-plan) can get
// a staggered fade/slide-in on load without becoming client components
// themselves — children render normally, this just owns the animation.
// `index` drives the stagger delay; keep it to visually grouped lists, not
// huge ones (delay grows linearly, so no cap needed at this app's scale).
export function FadeIn({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
