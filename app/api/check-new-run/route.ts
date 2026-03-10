import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRecentActivities, getActivityStreams } from "@/lib/strava";
import { preprocessRun } from "@/lib/preprocess";
import { generateRunCoachingAnalysis } from "@/lib/claude";
import type { User } from "@/lib/types";
import { randomUUID } from "crypto";

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
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const recentActivities = await getRecentActivities(user.id, 2);

    if (recentActivities.length === 0) {
      return NextResponse.json({ newRuns: 0, activities: [] });
    }

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const cutoffDate = twoDaysAgo.toISOString().split("T")[0];

    const recentRuns = recentActivities.filter((activity) => {
      const activityDate = new Date(activity.start_date)
        .toISOString()
        .split("T")[0];
      return activityDate >= cutoffDate;
    });

    const processedActivities = [];
    let newRunsCount = 0;

    for (const activity of recentRuns) {
      const { data: existingAnalysis } = await supabaseAdmin
        .from("run_analyses")
        .select("id, strava_activity_id")
        .eq("strava_activity_id", activity.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingAnalysis) {
        processedActivities.push({
          activityId: activity.id,
          alreadyAnalyzed: true,
        });
        continue;
      }

      const streams = await getActivityStreams(user.id, activity.id);

      // Calculate goal distance
      const goalDistanceKm = 
        user.goal_distance === 'custom' ? user.custom_distance_km :
        user.goal_distance === '5k' ? 5 :
        user.goal_distance === '10k' ? 10 :
        user.goal_distance === 'half' ? 21.1 :
        user.goal_distance === 'full' ? 42.2 : 10;

      const preprocessed = preprocessRun(
        streams,
        {
          id: activity.id,
          name: activity.name,
          type: activity.type,
          distance: activity.distance,
          moving_time: activity.moving_time,
          elapsed_time: activity.elapsed_time,
          start_date: activity.start_date,
          total_elevation_gain: activity.total_elevation_gain,
        },
        goalDistanceKm,
        user.goal_pace_seconds,
        user.goal_type as 'finish' | 'time' | 'pace'
      );

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
          run_type: preprocessed.run_type,
          distance_m: activity.distance,
          elapsed_time_s: preprocessed.elapsed_time_s,
          moving_time_s: preprocessed.moving_time_s,
          moving_pace_s: preprocessed.moving_pace_s,
          overall_pace_s: preprocessed.overall_pace_s,
          pace_gap_s: preprocessed.pace_gap_s,
          running_pct: preprocessed.speed_distribution.running_pct,
          walking_pct: preprocessed.speed_distribution.walking_pct,
          stopped_pct: preprocessed.speed_distribution.stopped_pct,
          km_splits_json: preprocessed.km_splits,
          elevation_json: preprocessed.elevation,
          analysis_json: null,
          run_summary_json: null,
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
        run_type: preprocessed.run_type,
        distance_m: activity.distance,
        elapsed_time_s: Math.round(preprocessed.elapsed_time_s),
        moving_time_s: Math.round(preprocessed.moving_time_s),
        moving_pace_s: Math.round(preprocessed.moving_pace_s),
        overall_pace_s: Math.round(preprocessed.overall_pace_s),
        pace_gap_s: Math.round(preprocessed.pace_gap_s),
        running_pct: preprocessed.speed_distribution.running_pct,
        walking_pct: preprocessed.speed_distribution.walking_pct,
        stopped_pct: preprocessed.speed_distribution.stopped_pct,
        km_splits_json: preprocessed.km_splits,
        elevation_json: preprocessed.elevation,
        analysis_json: claudeAnalysis,
        created_at: new Date().toISOString(),
      });

      newRunsCount++;
      processedActivities.push({
        activityId: activity.id,
        alreadyAnalyzed: false,
      });
    }

    const latestNew = processedActivities.find((a) => !a.alreadyAnalyzed);
    
    return NextResponse.json({
      found: newRunsCount > 0,
      newRuns: newRunsCount,
      activities: processedActivities,
      activityId: latestNew?.activityId || processedActivities[0]?.activityId,
    });
  } catch (error) {
    console.error("Error in /api/check-new-run:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
