import NextAuth, { NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const NEXTAUTH_URL = process.env.NEXTAUTH_URL;

if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
  throw new Error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET");
}
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("Missing NEXTAUTH_SECRET");
}

const expectedCallbackUrl = NEXTAUTH_URL
  ? `${NEXTAUTH_URL.replace(/\/$/, "")}/api/auth/callback/strava`
  : "(NEXTAUTH_URL not set)";

console.log("[NextAuth] Strava config:", {
  STRAVA_CLIENT_ID_set: Boolean(STRAVA_CLIENT_ID),
  STRAVA_CLIENT_SECRET_set: Boolean(STRAVA_CLIENT_SECRET),
  NEXTAUTH_URL: NEXTAUTH_URL ?? "(missing)",
  expectedCallbackUrl,
});

const StravaProvider: OAuthConfig<any> = {
  id: "strava",
  name: "Strava",
  type: "oauth",
  authorization: {
    url: "https://www.strava.com/oauth/authorize",
    params: {
      scope: "read,activity:read_all,profile:read_all",
      response_type: "code",
      approval_prompt: "auto",
    },
  },
  token: "https://www.strava.com/oauth/token",
  userinfo: "https://www.strava.com/api/v3/athlete",
  clientId: STRAVA_CLIENT_ID,
  clientSecret: STRAVA_CLIENT_SECRET,
  client: {
    token_endpoint_auth_method: "client_secret_post",
  },
  profile(profile) {
    return {
      id: String(profile.id),
      name: `${profile.firstname} ${profile.lastname}`,
      email: profile.email ?? `${profile.id}@strava.com`,
      image: profile.profile,
    };
  },
};

export const authOptions: NextAuthOptions = {
  providers: [StravaProvider],
  secret: process.env.NEXTAUTH_SECRET,
  logger: {
    error(code) {
      console.error("[NextAuth] error:", code);
    },
    warn(code) {
      console.warn("[NextAuth] warn:", code);
    },
    debug(code) {
      console.log("[NextAuth] debug:", code);
    },
  },
  callbacks: {
    // ─── signIn ──────────────────────────────────────────────────────────────
    // Upserts the user row in Supabase on every sign-in.
    // Does NOT try to set token fields here — that's the jwt callback's job.
    async signIn({ account, profile }) {
      console.log("[NextAuth] signIn called", {
        hasAccount: Boolean(account),
        hasProfile: Boolean(profile),
        profileId: (profile as any)?.id,
        accountProvider: account?.provider,
      });

      if (!account || !profile) {
        console.error("[NextAuth] signIn: missing account or profile");
        return false;
      }

      const stravaAthleteId =
        typeof (profile as any).id === "number"
          ? (profile as any).id
          : typeof (profile as any).id === "string"
          ? parseInt((profile as any).id, 10)
          : null;

      if (!stravaAthleteId || Number.isNaN(stravaAthleteId)) {
        console.error(
          "[NextAuth] signIn: invalid or missing profile.id",
          (profile as any).id
        );
        return false;
      }

      try {
        const accessToken = account.access_token as string | undefined;
        const refreshToken = account.refresh_token as string | undefined;
        const expiresAtSeconds =
          typeof account.expires_at === "number"
            ? account.expires_at
            : undefined;
        const tokenExpiresAt =
          typeof expiresAtSeconds === "number"
            ? new Date(expiresAtSeconds * 1000).toISOString()
            : null;

        const p = profile as {
          firstname?: string;
          lastname?: string;
          username?: string;
          email?: string;
        };
        const name =
          p.firstname && p.lastname
            ? `${p.firstname} ${p.lastname}`
            : p.username ?? null;
        const email =
          typeof p.email === "string" && p.email ? p.email : null;

        // Use upsert so we avoid a separate select round-trip and any
        // race condition between the select and insert/update.
        const { data: upserted, error } = await supabaseAdmin
          .from("users")
          .upsert(
            {
              strava_athlete_id: stravaAthleteId,
              name,
              email,
              access_token: accessToken ?? null,
              refresh_token: refreshToken ?? null,
              token_expires_at: tokenExpiresAt,
            },
            {
              onConflict: "strava_athlete_id", // unique column — upserts on match
              ignoreDuplicates: false,         // always update non-key columns
            }
          )
          .select("id")   // ← return the Supabase UUID so jwt callback can use it
          .single();

        if (error) {
          console.error("[NextAuth] signIn: Supabase upsert error", error);
          return false;
        }

        // Stash the Supabase UUID on the account object so the jwt callback
        // can pick it up without a second DB round-trip.
        // (account is mutable within a single NextAuth request cycle)
        (account as any).supabaseUserId = upserted.id;

        // Check if user needs historical sync (new user with no runs)
        const { count } = await supabaseAdmin
          .from("run_analyses")
          .select("id", { count: "exact", head: true })
          .eq("user_id", upserted.id);

        if (count === 0) {
          await supabaseAdmin
            .from("users")
            .update({ needs_historical_sync: true })
            .eq("id", upserted.id);
        }

        console.log(
          "[NextAuth] signIn: upserted strava_athlete_id",
          stravaAthleteId,
          "→ supabase id",
          upserted.id
        );
        return true;
      } catch (err) {
        console.error("[NextAuth] signIn: unexpected error", err);
        throw err;
      }
    },

    // ─── jwt ─────────────────────────────────────────────────────────────────
    // On initial sign-in (account is present) we persist everything we need
    // into the JWT so subsequent calls never hit the DB.
    // On subsequent requests only the token arg is populated — we just
    // forward what's already in it.
    async jwt({ token, account }) {
      if (account) {
        // Initial sign-in — account is populated
        token.access_token = account.access_token ?? undefined;
        token.refresh_token = account.refresh_token ?? undefined;
        token.expires_at = account.expires_at ?? undefined;

        // supabaseUserId was stashed onto account by the signIn callback above
        if ((account as any).supabaseUserId) {
          token.supabaseUserId = (account as any).supabaseUserId as string;
        } else {
          // Fallback: look up from DB in case signIn path didn't set it
          const stravaId =
            account.providerAccountId
              ? parseInt(account.providerAccountId, 10)
              : NaN;
          if (!Number.isNaN(stravaId)) {
            const { data: row } = await supabaseAdmin
              .from("users")
              .select("id")
              .eq("strava_athlete_id", stravaId)
              .maybeSingle();
            if (row) token.supabaseUserId = row.id;
          }
        }

        console.log("[NextAuth] jwt: token built", {
          supabaseUserId: token.supabaseUserId,
          has_access_token: Boolean(token.access_token),
        });
      }

      // On every subsequent request token already carries supabaseUserId —
      // nothing extra to do.
      return token;
    },

    // ─── session ─────────────────────────────────────────────────────────────
    // Expose the Supabase UUID as session.user.id so API routes can do
    // a straightforward .eq("id", session.user.id) query.
    async session({ session, token }) {
      if (session.user) {
        // Override the default (Strava) ID with the Supabase UUID
        session.user.id = (token.supabaseUserId as string) ?? null;
      }
      session.access_token = (token.access_token as string) ?? null;
      session.refresh_token = (token.refresh_token as string | null) ?? null;
      session.expires_at = (token.expires_at as number | null) ?? null;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };