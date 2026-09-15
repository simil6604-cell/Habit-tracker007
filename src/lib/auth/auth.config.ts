import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no Prisma/adapter here) — used by middleware.
export const authConfig = {
  // Hosting platforms (Render, Fly, Railway…) terminate TLS at a proxy and
  // forward the original host in X-Forwarded-Host; without this Auth.js
  // rejects every request as UntrustedHost.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
