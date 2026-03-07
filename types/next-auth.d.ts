import "next-auth";

declare module "next-auth" {
  interface Session {
    access_token?: string;
    refresh_token?: string | null;
    expires_at?: number | null;
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    supabaseUserId?: string;
    access_token?: string;
    refresh_token?: string | null;
    expires_at?: number | null;
  }
}
