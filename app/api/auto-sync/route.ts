import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchStravaActivities, fetchStravaStreams } from "@/lib/strava";
import { preprocessRun } from "@/lib/preprocess";
import { generateRunCoachingAnalysis } from "@/lib/claude";
import { refreshStravaTokenIfNeeded } from "@/lib/strava";
import { randomUUID } from "crypto";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const accessToken = await refreshStravaTokenIfNeeded(user.id);

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const after = Math.floor(twoDaysAgo.getTime() / 1000);

    const activities = await fetchStravaActivities(accessToken, 1, 30, after);

    if (!activities || activities.length === 0) {
      return NextResponse.json({ newRuns: 0, activities: [] });
    }

    const newActivities = [];

    for (const activity of activities) {
      const { data: existing } = await supabaseAdmin
        .from("run_analyses")
        .select("id")
        .eq("strava_activity_id", activity.id)
        .maybeSingle();

      if (existing) {
        continue;
      }

      try {
        const streams = await fetchStravaStreams(accessToken, activity.id);
        if (!streams) continue;

        const { data: previousRun } = await supabaseAdmin
          .from("run_analyses")
          .select("moving_pace_s, overall_pace_s")
          .eq("user_id", user.id)
          .order("run_date", { ascending: false })
          .limit(1)
          .single();

        const preprocessed = preprocessRun(
          streams,
          activity,
          user.goal_pace_seconds,
          previousRun || undefined
        );

        const analysis = await generateRunCoachingAnalysis(
          preprocessed,
          user.goal_distance,
          user.goal_pace_seconds,
          user.goal_type,
          user.goal_date
        );

        await supabaseAdmin.from("run_analyses").insert({
          id: randomUUID(),
          user_id: user.id,
          strava_activity_id: activity.id,
          run_date: activity.start_date_local.split("T")[0],
          distance_m: preprocessed.distance_km * 1000,
          elapsed_time_s: Math.round(preprocessed.elapsed_time_s),
          moving_time_s: Math.round(preprocessed.moving_time_s),
          moving_pace_s: Math.round(preprocessed.moving_pace_s),
          overall_pace_s: Math.round(preprocessed.overall_pace_s),
          pace_gap_s: Math.round(preprocessed.pace_gap_s),
          running_pct: preprocessed.speed_distribution.running_pct,
          shuffling_pct: preprocessed.speed_distribution.shuffling_pct,
          stationary_pct: preprocessed.speed_distribution.stationary_pct,
          km_splits_json: preprocessed.km_splits,
          elevation_json: preprocessed.elevation,
          analysis_json: analysis,
          created_at: new Date().toISOString(),
        });

        newActivities.push({
          id: activity.id,
          name: activity.name,
          distance: activity.distance,
        });

        await sleep(400);
      } catch (error) {
        console.error(`Error analyzing activity ${activity.id}:`, error);
      }
    }

    return NextResponse.json({
      newRuns: newActivities.length,
      activities: newActivities,
    });
  } catch (error) {
    console.error("Error in auto-sync:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
