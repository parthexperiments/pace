import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getActivityStreams } from "@/lib/strava";
import { preprocessRun } from "@/lib/preprocess";
import { generateRunCoachingAnalysis } from "@/lib/claude";
import type { User, RunAnalysis } from "@/lib/types";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { activityId } = await request.json();
    if (!activityId || typeof activityId !== "number") {
      return NextResponse.json(
        { error: "activityId is required and must be a number" },
        { status: 400 }
      );
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (userError || !user) {
      console.error("User lookup error:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: existingAnalysis } = await supabaseAdmin
      .from("run_analyses")
      .select("*")
      .eq("strava_activity_id", activityId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingAnalysis) {
      return NextResponse.json({
        analysis: existingAnalysis,
        cached: true,
        user_goal_pace_seconds: user.goal_pace_seconds,
      });
    }

    const streams = await getActivityStreams(user.id, activityId);

    const activityUrl = `https://www.strava.com/api/v3/activities/${activityId}`;
    const activityRes = await fetch(activityUrl, {
      headers: {
        Authorization: `Bearer ${user.access_token}`,
      },
    });

    if (!activityRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch activity from Strava" },
        { status: 500 }
      );
    }

    const activity = await activityRes.json();

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
        strava_activity_id: activityId,
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

    const runDate = new Date(activity.start_date).toISOString().split('T')[0];
    
    const { data: newAnalysis, error: insertError } = await supabaseAdmin
      .from("run_analyses")
      .insert({
        id: randomUUID(),
        user_id: user.id,
        strava_activity_id: activityId,
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
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert analysis:", insertError);
      return NextResponse.json(
        { error: "Failed to save analysis" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      analysis: newAnalysis,
      cached: false,
      user_goal_pace_seconds: user.goal_pace_seconds,
    });
  } catch (error) {
    console.error("Error in /api/analyse-run:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
