"use server";

import { z } from "zod";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { users, userProfiles, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signIn } from "@/lib/auth";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignUpState = { error?: string };

export async function signUpAction(_prevState: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const email = parsed.data.email.toLowerCase();
  const tenant = await getCurrentTenant();

  const created = await withTenant(tenant.id, async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    if (existing) return null;

    const passwordHash = await hash(parsed.data.password, 12);
    const [user] = await tx
      .insert(users)
      .values({ tenantId: tenant.id, email, passwordHash })
      .returning();
    await tx.insert(userProfiles).values({ tenantId: tenant.id, userId: user.id });
    await tx.insert(subscriptions).values({ tenantId: tenant.id, userId: user.id });
    return user;
  });

  if (!created) {
    return { error: "An account with that email already exists." };
  }

  await signIn("credentials", {
    email,
    password: parsed.data.password,
    redirectTo: "/dashboard",
  });
  redirect("/dashboard");
}
