import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: string;
      tenantId: string;
    };
  }
}

// Not augmenting `next-auth/jwt`'s ambient JWT interface here: that module is
// a pure `export * from "@auth/core/jwt"` re-export with no local symbols,
// which this next-auth beta's bundler-mode types can't resolve for `declare
// module` merging (plain imports of it work fine — only augmentation fails).
// A local shape + assertions at the two call sites below is simpler than
// fighting that resolution bug.
type AppJWT = { userId?: string; role?: string; tenantId?: string };

const { handlers, signIn, signOut, auth: rawAuth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Multiple tenant subdomains (incl. arbitrary custom domains in Phase 8)
  // hit this same deployment, so we can't pin a single trusted host.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        // Tenant is resolved from the request host, not the credentials —
        // a user can only ever authenticate against the tenant they're
        // currently browsing, which is what makes email uniqueness
        // per-tenant (not global) safe. withTenant sets app.tenant_id for
        // this query so RLS actually returns the row (an unscoped query
        // here would just get filtered to zero rows, not "unsafe" but
        // silently broken).
        const tenant = await getCurrentTenant();
        const user = await withTenant(tenant.id, async (tx) => {
          const [row] = await tx.select().from(users).where(eq(users.email, email.toLowerCase()));
          return row;
        });

        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const appToken = token as AppJWT;
      if (user) {
        appToken.userId = user.id;
        appToken.role = (user as { role: string }).role;
        appToken.tenantId = (user as { tenantId: string }).tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      const { userId, role, tenantId } = token as AppJWT;
      if (userId && role && tenantId) {
        session.user.id = userId;
        session.user.role = role;
        session.user.tenantId = tenantId;
      }
      return session;
    },
  },
});

// next-auth v5 doesn't memoize `auth()` itself, and RootLayout + every page
// both call it — without this, one request does two full JWT decrypt/verify
// passes (and, if the cookie is stale/invalid, logs the decode error twice).
// React's cache() gives per-request dedup for free.
export const auth = cache(rawAuth);
export { handlers, signIn, signOut };
