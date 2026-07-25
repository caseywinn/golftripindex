import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getPgPool } from "@/lib/db";
import { upsertUserByEmail } from "@/lib/users";
import { claimClubInvites } from "@/lib/clubMembers";
import bcrypt from "bcryptjs";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const pool = getPgPool();
        const { rows } = await pool.query(
          "SELECT id, name, email, password_hash FROM users WHERE email = $1",
          [(credentials.email as string).toLowerCase()]
        );
        const user = rows[0];
        if (!user) return null;
        // OAuth-only account (no password set). Reject explicitly rather than
        // relying on bcrypt.compare(pw, null) happening to return false.
        if (!user.password_hash) return null;
        const valid = await bcrypt.compare(credentials.password as string, user.password_hash);
        if (!valid) return null;
        return { id: String(user.id), name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    // Accounts are linked by email: a Google sign-in resolves to the existing
    // users row with that address, password or not. That makes an unverified
    // provider email an account-takeover path, so require the claim to be
    // explicitly true rather than merely not-false. Google's ID token always
    // carries email_verified when the email scope is granted; if this ever
    // rejects a legitimate user, the warning below is the thread to pull.
    signIn({ account, profile }) {
      if (account?.provider === "google") {
        if (!profile?.email || profile.email_verified !== true) {
          console.warn("[auth] rejected google sign-in: email_verified not true", {
            hasEmail: !!profile?.email,
            emailVerified: profile?.email_verified,
          });
          return false;
        }
      }
      return true;
    },
    // Runs on initial sign-in (account is set then), on token refresh, and when
    // a client calls useSession().update(...). The update path lets the bag page
    // push an edited Handle back into the session so the header updates without a
    // re-login; everything else falls through to the sign-in logic below.
    async jwt({ token, user, account, trigger, session }) {
      if (trigger === "update" && typeof session?.name === "string" && session.name) {
        token.name = session.name;
        return token;
      }
      if (!account || !user?.email) return token;
      const email = user.email.toLowerCase();

      // Google sign-in writes no users row of its own, so token.sub would
      // otherwise be Google's subject string rather than a users.id — an
      // identity that joins to nothing and can't hold a billable seat. Pin
      // token.sub to the local row so session.user.id means the same thing for
      // every provider. Credentials already returns a real users.id.
      const localId =
        account.provider === "google"
          ? await upsertUserByEmail(email, user.name)
          : String(user.id);
      token.sub = localId;

      // Claim any club invites sent to this address. Must happen after the
      // normalization above, or a Google member would bind their seat to a
      // Google subject. Never block sign-in on this: a failed bind should cost
      // someone a roster row, not their ability to log into the site at all.
      try {
        await claimClubInvites(localId, email);
      } catch (err) {
        console.error("[auth] claimClubInvites failed", { email, err });
      }

      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: {
    signIn: "/register",
  },
});
