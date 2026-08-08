"use client";

import { usePathname } from "next/navigation";
import { ONBOARDING_STEPS } from "@/lib/onboarding/steps";

export function StepProgress() {
  const pathname = usePathname();
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => pathname.endsWith(s.path));

  return (
    <ol className="mx-auto flex max-w-2xl items-center gap-2 px-6 pt-10 text-xs text-[#1f2a1f]/60">
      {ONBOARDING_STEPS.map((step, i) => (
        <li key={step.path} className="flex flex-1 items-center gap-2">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
              i <= currentIndex
                ? "bg-(--brand-primary) text-white"
                : "bg-black/10 text-[#1f2a1f]/50"
            }`}
          >
            {i + 1}
          </span>
          <span className={`hidden sm:inline ${i === currentIndex ? "font-medium text-(--brand-primary)" : ""}`}>
            {step.label}
          </span>
          {i < ONBOARDING_STEPS.length - 1 && (
            <span className="h-px flex-1 bg-black/10" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}
