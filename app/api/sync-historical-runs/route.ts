import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchStravaActivities, fetchStravaStreams, refreshStravaTokenIfNeeded } from "@/lib/strava";
import { preprocessRun } from "@/lib/preprocess";
import { generateRunCoachingAnalysis } from "@/lib/claude";
import type { User } from "@/lib/types";
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

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.access_token) {
      return NextResponse.json(
        { error: "No Strava access token" },
        { status: 400 }
      );
    }

    const accessToken = await refreshStravaTokenIfNeeded(user.id);

    const activities = await fetchStravaActivities({
      accessToken: accessToken,
      perPage: 30,
    });

    const runs = activities.filter((a: any) => a.type === "Run");

    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const activity of runs) {
      try {
        const { data: existing } = await supabaseAdmin
          .from("run_analyses")
          .select("id")
          .eq("strava_activity_id", activity.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const streams = await fetchStravaStreams({
          accessToken: accessToken,
          activityId: activity.id,
          keys: "time,distance,velocity_smooth,altitude",
        });

        const preprocessed = preprocessRun(streams, {
          id: activity.id,
          name: activity.name,
          type: activity.type,
          distance: activity.distance,
          moving_time: activity.moving_time,
          elapsed_time: activity.elapsed_time,
          start_date: activity.start_date,
          total_elevation_gain: activity.total_elevation_gain,
        });

        const { data: previousRunData } = await supabaseAdmin
          .from("run_analyses")
          .select("moving_pace_s, overall_pace_s")
          .eq("user_id", user.id)
          .order("run_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const claudeAnalysis = await generateRunCoachingAnalysis({
          run: {
            id: "",
            user_id: user.id,
            strava_activity_id: activity.id,
            run_date: activity.start_date,
            distance_m: activity.distance,
            elapsed_time_s: preprocessed.elapsed_time_s,
            moving_time_s: preprocessed.moving_time_s,
            moving_pace_s: preprocessed.moving_pace_s,
            overall_pace_s: preprocessed.overall_pace_s,
            pace_gap_s: preprocessed.pace_gap_s,
            running_pct: preprocessed.speed_distribution.running_pct,
            shuffling_pct: preprocessed.speed_distribution.shuffling_pct,
            stationary_pct: preprocessed.speed_distribution.stationary_pct,
            km_splits_json: preprocessed.km_splits,
            elevation_json: preprocessed.elevation,
            analysis_json: null,
            created_at: null,
          },
          previousRun: previousRunData,
          user: user as User,
        });

        const runDate = new Date(activity.start_date)
          .toISOString()
          .split("T")[0];

        await supabaseAdmin.from("run_analyses").insert({
          id: randomUUID(),
          user_id: user.id,
          strava_activity_id: activity.id,
          run_date: runDate,
          distance_m: activity.distance,
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
          analysis_json: claudeAnalysis,
          created_at: new Date().toISOString(),
        });

        processed++;
        
        await sleep(400);
      } catch (error) {
        console.error(`Error processing activity ${activity.id}:`, error);
        errors.push(
          `Activity ${activity.id}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return NextResponse.json({
      processed,
      skipped,
      total: runs.length,
      errors,
    });
  } catch (error) {
    console.error("Error in /api/sync-historical-runs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
