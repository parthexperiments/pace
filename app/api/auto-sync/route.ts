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

    const activities = await fetchStravaActivities({
      accessToken,
      perPage: 30,
      after,
    });

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
        const streams = await fetchStravaStreams({
          accessToken,
          activityId: activity.id,
        });
        if (!streams) continue;

        const { data: previousRun } = await supabaseAdmin
          .from("run_analyses")
          .select("moving_pace_s, overall_pace_s")
          .eq("user_id", user.id)
          .order("run_date", { ascending: false })
          .limit(1)
          .single();

        const preprocessed = preprocessRun(streams, activity);

        const analysis = await generateRunCoachingAnalysis({
          run: {
            ...preprocessed,
            id: "",
            user_id: user.id,
            strava_activity_id: activity.id,
            run_date: activity.start_date.split("T")[0],
            distance_m: preprocessed.distance_km * 1000,
            running_pct: preprocessed.speed_distribution.running_pct,
            shuffling_pct: preprocessed.speed_distribution.shuffling_pct,
            stationary_pct: preprocessed.speed_distribution.stationary_pct,
            analysis_json: null,
            created_at: new Date().toISOString(),
            km_splits_json: preprocessed.km_splits,
            elevation_json: preprocessed.elevation,
          },
          previousRun: previousRun || null,
          user: {
            id: user.id,
            strava_athlete_id: user.strava_athlete_id,
            name: user.name,
            email: user.email,
            access_token: user.access_token,
            refresh_token: user.refresh_token,
            token_expires_at: user.token_expires_at,
            goal_distance: user.goal_distance,
            custom_distance_km: user.custom_distance_km,
            goal_type: user.goal_type,
            goal_time_seconds: user.goal_time_seconds,
            goal_pace_seconds: user.goal_pace_seconds,
            deadline_type: user.deadline_type,
            goal_date: user.goal_date,
            available_days: user.available_days,
            coach_tip_dismissed: user.coach_tip_dismissed,
            created_at: user.created_at,
          },
        });

        await supabaseAdmin.from("run_analyses").insert({
          id: randomUUID(),
          user_id: user.id,
          strava_activity_id: activity.id,
          run_date: activity.start_date.split("T")[0],
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
