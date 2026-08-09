"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type SignUpState } from "@/lib/actions/signup";

const initialState: SignUpState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold text-(--brand-primary)">Start your plot</h1>
        <p className="mt-1 text-sm text-(--text-muted)">
          Create an account — we&apos;ll walk you through setting up your garden next.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-black/15 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-black/15 px-3 py-2"
          />
        </label>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-(--brand-primary) px-4 py-2 text-white disabled:opacity-60"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-(--text-muted)">
        Already growing with us?{" "}
        <Link href="/login" className="text-(--brand-primary) underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
