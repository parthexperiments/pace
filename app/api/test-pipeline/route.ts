import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { preprocessRun } from "@/lib/preprocess";
import type { StravaActivitySummary, StravaStreams } from "@/lib/strava";

// ─── Strava API helpers ───────────────────────────────────────────────────────

async function fetchRecentActivities(
  accessToken: string,
  perPage = 3
): Promise<StravaActivitySummary[]> {
  const url = new URL("https://www.strava.com/api/v3/athlete/activities");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", "1");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava activities fetch failed ${res.status}: ${body}`);
  }

  return res.json();
}

async function fetchActivityStreams(
  accessToken: string,
  activityId: number
): Promise<StravaStreams> {
  const url = new URL(
    `https://www.strava.com/api/v3/activities/${activityId}/streams`
  );
  url.searchParams.set("keys", "time,distance,velocity_smooth,altitude");
  url.searchParams.set("key_by_type", "true");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava streams fetch failed ${res.status}: ${body}`);
  }

  return res.json();
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  // 1. Auth check — session.user.id is the Supabase UUID (set in jwt/session callbacks)
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Look up user by Supabase UUID to get the stored access_token
  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, access_token, goal_pace_seconds")
    .eq("id", session.user.id)   // ← UUID primary key, not email
    .single();

  if (userError || !userRow) {
    console.error("[test-pipeline] user lookup failed", {
      id: session.user.id,
      error: userError?.message,
    });
    return NextResponse.json(
      { error: "User not found", debug: { id: session.user.id } },
      { status: userError ? 500 : 404 }
    );
  }

  const accessToken: string = userRow.access_token;
  const goalPaceSeconds: number | null = userRow.goal_pace_seconds ?? null;

  if (!accessToken) {
    return NextResponse.json(
      { error: "No Strava access token stored for this user" },
      { status: 502 }
    );
  }

  // 3. Fetch last 3 Strava activities
  let activities: StravaActivitySummary[];
  try {
    activities = await fetchRecentActivities(accessToken, 3);
  } catch (err) {
    console.error("[test-pipeline] fetchRecentActivities failed", err);
    return NextResponse.json(
      { error: "Failed to fetch Strava activities" },
      { status: 502 }
    );
  }

  if (!activities.length) {
    return NextResponse.json({ message: "No activities found" });
  }

  // 4. Find most recent run activity
  const mostRecentRun = activities.find((a) => a.type === "Run");

  if (!mostRecentRun) {
    return NextResponse.json({ message: "No activities found" });
  }

  // 5. Fetch streams for that activity
  let streams: StravaStreams | null = null;
  try {
    streams = await fetchActivityStreams(accessToken, mostRecentRun.id);
  } catch (err) {
    console.error("[test-pipeline] fetchActivityStreams failed", err);
    // Non-fatal — preprocessRun handles null streams gracefully
  }

  // 6. Preprocess
  const preprocessed = preprocessRun(streams, mostRecentRun);

  // 7. Return result
  return NextResponse.json({
    most_recent_run: {
      id: mostRecentRun.id,
      name: mostRecentRun.name,
      type: mostRecentRun.type,
      start_date: mostRecentRun.start_date,
      distance: mostRecentRun.distance,
      elapsed_time: mostRecentRun.elapsed_time,
    },
    preprocessed,
  });
}
