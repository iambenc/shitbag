"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type RequestPasswordResetState } from "@/lib/actions/passwordReset";

const initialState: RequestPasswordResetState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Reset your password</h1>
        <p className="mt-1 text-sm text-(--text-muted)">Enter your email and we&rsquo;ll send you a reset link.</p>
      </div>
      {state.message ? (
        <p className="text-sm text-(--text-muted)">{state.message}</p>
      ) : (
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
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-(--brand-primary) px-6 py-2 text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="text-sm text-(--text-muted)">
        <Link href="/login" className="text-(--brand-primary) underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
