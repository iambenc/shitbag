"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { PlusIcon, CloseIcon } from "@/components/icons";
import { QuickAddTaskForm } from "./QuickAddTaskForm";

// "Add plant" (from the mockup's 6-item menu) is deliberately dropped — no
// "add a plant instance" feature exists in this app. The old separate "Add
// seeds"/"Add garden area" entries both pointed at what's now one page
// (seeds and equipment both moved to /my-shed — equipment was always the
// real destination behind "Add garden area", since adding it there is what
// auto-places it as growing space) — consolidated into one entry, with
// "Plan garden layout" added so arranging what's already placed stays a
// first-class quick action too.
const LINK_ITEMS = [
  { href: "/my-shed", label: "Add to My Shed" },
  { href: "/garden/layout", label: "Plan garden layout" },
  { href: "/journal", label: "Add journal entry" },
  { href: "/plant-health", label: "Diagnose plant" },
];

export function FloatingActionButton() {
  const [open, setOpen] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  function close() {
    setOpen(false);
    setAddingTask(false);
  }

  return (
    <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && !addingTask && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="flex max-w-[calc(100vw-3rem)] flex-col items-end gap-2"
          >
            <button
              type="button"
              onClick={() => setAddingTask(true)}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow-card transition hover:bg-(--brand-primary)/10"
            >
              Add task
            </button>
            {LINK_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow-card transition hover:bg-(--brand-primary)/10"
              >
                {item.label}
              </Link>
            ))}
          </motion.div>
        )}
        {addingTask && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="w-72 max-w-[calc(100vw-3rem)] rounded-lg border border-black/10 bg-white p-4 shadow-card"
          >
            <QuickAddTaskForm onDone={close} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={open ? "Close quick actions" : "Quick actions"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-(--brand-primary) text-white shadow-button transition hover:brightness-90 active:scale-95"
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <PlusIcon className="h-6 w-6" />}
      </button>
    </div>
  );
}
