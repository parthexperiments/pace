import { supabaseAdmin } from "@/lib/supabase-admin";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

const TOKEN_REFRESH_BUFFER_SECONDS = 60;

export interface StravaActivitySummary {
  id: number;
  name: string;
  type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_date: string;
  total_elevation_gain: number;
}

export interface StravaStream<T = number> {
  data: T[];
}

export interface StravaStreams {
  time?: StravaStream<number>;
  distance?: StravaStream<number>;
  velocity_smooth?: StravaStream<number>;
  altitude?: StravaStream<number>;
  moving?: StravaStream<boolean>;
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null; // unix seconds
}

interface SupabaseUserWithTokens {
  id: string;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

export async function refreshStravaAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
}> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh Strava token: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
  };
}

export function getTokensFromUserRow(
  user: SupabaseUserWithTokens
): StravaTokens | null {
  if (!user.access_token) {
    return null;
  }

  const expires_at =
    user.token_expires_at != null
      ? Math.floor(new Date(user.token_expires_at).getTime() / 1000)
      : null;

  return {
    access_token: user.access_token,
    refresh_token: user.refresh_token,
    expires_at,
  };
}

/**
 * Checks token_expires_at in users table; if expired, POSTs to Strava oauth/token
 * with grant_type: refresh_token, updates access_token, refresh_token, token_expires_at
 * in DB, and returns a valid access_token.
 */
export async function refreshStravaTokenIfNeeded(userId: string): Promise<string> {
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user) {
    throw new Error("User not found or failed to load tokens");
  }

  if (!user.access_token) {
    throw new Error("No Strava access token stored for user");
  }

  const expiresAtSeconds =
    user.token_expires_at != null
      ? Math.floor(new Date(user.token_expires_at).getTime() / 1000)
      : null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const needsRefresh =
    expiresAtSeconds == null ||
    expiresAtSeconds - nowSeconds < TOKEN_REFRESH_BUFFER_SECONDS;

  if (!needsRefresh) {
    return user.access_token;
  }

  if (!user.refresh_token) {
    throw new Error("Token expired and no refresh token available");
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET");
  }

  const refreshed = await refreshStravaAccessToken({
    clientId,
    clientSecret,
    refreshToken: user.refresh_token,
  });

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    throw new Error("Failed to save refreshed tokens to database");
  }

  return refreshed.access_token;
}

/**
 * Fetches recent Run activities. Calls refreshStravaTokenIfNeeded first, then
 * GET /athlete/activities, filters for type === 'Run', returns activities from last N days.
 */
export async function getRecentActivities(
  userId: string,
  days = 14
): Promise<StravaActivitySummary[]> {
  const accessToken = await refreshStravaTokenIfNeeded(userId);
  const afterSeconds = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const all = await fetchStravaActivities({
    accessToken,
    perPage: 50,
    after: afterSeconds,
  });
  return all.filter((a) => a.type === "Run");
}

/**
 * Fetches Strava activities for the user. Calls refreshStravaTokenIfNeeded first,
 * then GET /athlete/activities with optional after (unix timestamp).
 */
export async function getStravaActivities(
  userId: string,
  afterDate?: Date | number
): Promise<StravaActivitySummary[]> {
  const accessToken = await refreshStravaTokenIfNeeded(userId);

  const after =
    afterDate instanceof Date
      ? Math.floor(afterDate.getTime() / 1000)
      : typeof afterDate === "number"
        ? afterDate
        : undefined;

  return fetchStravaActivities({
    accessToken,
    perPage: 30,
    after,
  });
}

export async function fetchStravaActivities(params: {
  accessToken: string;
  perPage?: number;
  after?: number;
}): Promise<StravaActivitySummary[]> {
  const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
  url.searchParams.set("per_page", String(params.perPage ?? 20));
  if (params.after != null) {
    url.searchParams.set("after", String(params.after));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Strava activities: ${res.status} ${text}`);
  }

  const json = (await res.json()) as any[];

  return json.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    distance: a.distance,
    moving_time: a.moving_time,
    elapsed_time: a.elapsed_time,
    start_date: a.start_date,
    total_elevation_gain: a.total_elevation_gain,
  }));
}

/**
 * Fetches activity streams. Calls refreshStravaTokenIfNeeded first, then
 * GET /activities/{id}/streams with keys time,distance,velocity_smooth,altitude.
 */
export async function getActivityStreams(
  userId: string,
  activityId: number
): Promise<StravaStreams | null> {
  const accessToken = await refreshStravaTokenIfNeeded(userId);
  return fetchStravaStreams({
    accessToken,
    activityId,
    keys: "time,distance,velocity_smooth,altitude",
  });
}

export async function fetchStravaStreams(params: {
  accessToken: string;
  activityId: number;
  keys?: string;
}): Promise<StravaStreams | null> {
  const url = new URL(
    `${STRAVA_API_BASE}/activities/${params.activityId}/streams`
  );
  url.searchParams.set(
    "keys",
    params.keys ?? "time,distance,velocity_smooth,altitude,moving"
  );
  url.searchParams.set("key_by_type", "true");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
    cache: "no-store",
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Strava streams: ${res.status} ${text}`);
  }

  const json = (await res.json()) as Record<string, { data: any[] }>;

  const streams: StravaStreams = {};

  if (json.time?.data) streams.time = { data: json.time.data as number[] };
  if (json.distance?.data)
    streams.distance = { data: json.distance.data as number[] };
  if (json.velocity_smooth?.data)
    streams.velocity_smooth = {
      data: json.velocity_smooth.data as number[],
    };
  if (json.altitude?.data)
    streams.altitude = { data: json.altitude.data as number[] };
  if (json.moving?.data)
    streams.moving = { data: json.moving.data as boolean[] };

  return streams;
}

