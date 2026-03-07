import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  fetchStravaActivities,
  fetchStravaStreams,
  getTokensFromUserRow,
  refreshStravaAccessToken,
} from "@/lib/strava";
import { preprocessRun } from "@/lib/preprocess";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select(
      "id, email, access_token, refresh_token, token_expires_at"
    )
    .eq("email", email)
    .maybeSingle();

  if (userError) {
    console.error("Error fetching user from Supabase", userError);
    return NextResponse.json(
      { error: "Failed to load user" },
      { status: 500 }
    );
  }

  if (!userRow) {
    return NextResponse.json(
      { error: "User not found in Supabase" },
      { status: 404 }
    );
  }

  let tokens = getTokensFromUserRow(userRow);

  if (!tokens || !tokens.access_token) {
    return NextResponse.json(
      { error: "No Strava tokens stored for user" },
      { status: 400 }
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const needsRefresh =
    tokens.expires_at != null && tokens.expires_at - nowSeconds < 60;

  if (needsRefresh && tokens.refresh_token) {
    try {
      const refreshed = await refreshStravaAccessToken({
        clientId: process.env.STRAVA_CLIENT_ID as string,
        clientSecret: process.env.STRAVA_CLIENT_SECRET as string,
        refreshToken: tokens.refresh_token,
      });

      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
        })
        .eq("id", userRow.id);

      if (updateError) {
        console.error("Failed to update refreshed Strava tokens", updateError);
      } else {
        tokens = {
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: refreshed.expires_at,
        };
      }
    } catch (err) {
      console.error("Error refreshing Strava token", err);
      return NextResponse.json(
        { error: "Failed to refresh Strava token" },
        { status: 500 }
      );
    }
  }

  let activities;
  try {
    activities = await fetchStravaActivities({
      accessToken: tokens.access_token,
      perPage: 20,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch Strava activities" },
      { status: 502 }
    );
  }

  const runActivities = activities.filter((a) => a.type === "Run");

  const synced: number[] = [];
  const skipped: number[] = [];

  for (const activity of runActivities) {
    try {
      const { data: existing } = await supabaseAdmin
        .from("run_analyses")
        .select("id")
        .eq("strava_activity_id", activity.id)
        .maybeSingle();

      if (existing) {
        skipped.push(activity.id);
        continue;
      }

      const streams = await fetchStravaStreams({
        accessToken: tokens.access_token,
        activityId: activity.id,
      });

      const metrics = preprocessRun(streams, activity);

      const { error: insertError } = await supabaseAdmin
        .from("run_analyses")
        .insert({
          user_id: userRow.id,
          strava_activity_id: activity.id,
          run_date: activity.start_date,
          distance_m: activity.distance,
          elapsed_time_s: metrics.elapsed_time_s,
          moving_time_s: metrics.moving_time_s,
          moving_pace_s: metrics.moving_pace_s,
          overall_pace_s: metrics.overall_pace_s,
          pace_gap_s: metrics.pace_gap_s,
          running_pct: metrics.speed_distribution.running_pct,
          shuffling_pct: metrics.speed_distribution.shuffling_pct,
          stationary_pct: metrics.speed_distribution.stationary_pct,
          km_splits_json: { splits: metrics.km_splits },
          elevation_json: metrics.elevation,
          analysis_json: {},
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Failed to insert run_analysis", insertError);
        continue;
      }

      synced.push(activity.id);
    } catch (err) {
      console.error("Error processing Strava activity", activity.id, err);
    }
  }

  return NextResponse.json({
    synced_count: synced.length,
    skipped_count: skipped.length,
    synced_activity_ids: synced,
    skipped_activity_ids: skipped,
  });
}

