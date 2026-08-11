import Link from "next/link";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { auth } from "@/lib/auth";

export default async function Home() {
  const [tenant, session] = await Promise.all([getCurrentTenant(), auth()]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-6 px-6 py-24">
      <span className="text-4xl" aria-hidden>
        🌿
      </span>
      <h1 className="font-display text-3xl font-semibold leading-tight text-(--brand-primary)">
        Grow more from the space you&apos;ve got.
      </h1>
      <p className="text-lg text-(--text-muted)">
        {tenant.displayName} helps home gardeners plan what to grow, when to sow it, and how to
        keep a steady harvest — from a windowsill to a full allotment.
      </p>
      <Link
        href={session?.user ? "/dashboard" : "/signup"}
        className="rounded-full bg-(--brand-primary) px-6 py-3 font-medium text-white shadow-button hover:brightness-90 active:scale-95 transition"
      >
        {session?.user ? "Go to your dashboard" : "Get started"}
      </Link>
    </div>
  );
}
