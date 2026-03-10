import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getActivityStreams } from "@/lib/strava";
import { preprocessRun } from "@/lib/preprocess";
import { generateRunCoachingAnalysis, extractRunSummaryFromAnalysis } from "@/lib/claude";
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

    // Calculate goal distance in km
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

    const run_type = preprocessed.run_type;

    const { data: previousRunSameType } = await supabaseAdmin
      .from("run_analyses")
      .select("id, run_summary_json, km_splits_json, run_date, walking_pct")
      .eq("user_id", user.id)
      .eq("run_type", run_type)
      .neq("strava_activity_id", activityId)
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    let previousRunSummary: {
      run_type: string;
      date: string;
      distance_km: number;
      overall_pace_s: number;
      running_pct: number;
      walking_pct: number;
      stopped_pct: number;
      insights: string[];
      recommendation: string;
      recommendation_followed: boolean | null;
    } | null = null;
    if (previousRunSameType?.run_summary_json && typeof previousRunSameType.run_summary_json === "object") {
      const prev = previousRunSameType.run_summary_json as Record<string, unknown>;
      const rec = String(prev.recommendation ?? "").toLowerCase();
      let recommendation_followed: boolean | null = null;
      if (rec) {
        const prevWalking = Number(prev.walking_pct ?? 0);
        const currWalking = preprocessed.speed_distribution.walking_pct;
        const prevSplits = (previousRunSameType.km_splits_json as { km: number; pace_s: number }[]) ?? [];
        const prevFirstKmPace = prevSplits[0]?.pace_s;
        const currFirstKmPace = preprocessed.km_splits[0]?.pace_s;
        if ((rec.includes("start slower") || rec.includes("slow down") || rec.includes("first km") || rec.includes("ease into")) && prevFirstKmPace != null && currFirstKmPace != null) {
          recommendation_followed = currFirstKmPace > prevFirstKmPace;
        } else if ((rec.includes("reduce walking") || rec.includes("walking") || rec.includes("less walk")) && prevWalking > 0) {
          recommendation_followed = currWalking < prevWalking;
        }
      }
      const updatedPrevJson = { ...prev, recommendation_followed };
      await supabaseAdmin
        .from("run_analyses")
        .update({ run_summary_json: updatedPrevJson })
        .eq("id", previousRunSameType.id);

      previousRunSummary = {
        run_type: String(prev.run_type ?? run_type),
        date: String(prev.date ?? previousRunSameType.run_date),
        distance_km: Number(prev.distance_km ?? 0),
        overall_pace_s: Number(prev.overall_pace_s ?? 0),
        running_pct: Number(prev.running_pct ?? 0),
        walking_pct: Number(prev.walking_pct ?? 0),
        stopped_pct: Number(prev.stopped_pct ?? 0),
        insights: Array.isArray(prev.insights) ? prev.insights : [],
        recommendation: String(prev.recommendation ?? ""),
        recommendation_followed,
      };
    }

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
      previousRunSummary: previousRunSummary,
    });

    const runDate = new Date(activity.start_date).toISOString().split('T')[0];

    let run_summary_json: {
      run_type: string;
      date: string;
      distance_km: number;
      overall_pace_s: number;
      running_pct: number;
      walking_pct: number;
      stopped_pct: number;
      insights: string[];
      recommendation: string;
      recommendation_followed: boolean | null;
    };
    try {
      const { insights, recommendation } = await extractRunSummaryFromAnalysis(claudeAnalysis);
      run_summary_json = {
        run_type: preprocessed.run_type,
        date: runDate,
        distance_km: preprocessed.distance_km,
        overall_pace_s: Math.round(preprocessed.overall_pace_s),
        running_pct: preprocessed.speed_distribution.running_pct,
        walking_pct: preprocessed.speed_distribution.walking_pct,
        stopped_pct: preprocessed.speed_distribution.stopped_pct,
        insights,
        recommendation,
        recommendation_followed: null,
      };
    } catch (err) {
      console.error("Failed to extract run summary:", err);
      run_summary_json = {
        run_type: preprocessed.run_type,
        date: runDate,
        distance_km: preprocessed.distance_km,
        overall_pace_s: Math.round(preprocessed.overall_pace_s),
        running_pct: preprocessed.speed_distribution.running_pct,
        walking_pct: preprocessed.speed_distribution.walking_pct,
        stopped_pct: preprocessed.speed_distribution.stopped_pct,
        insights: [],
        recommendation: "",
        recommendation_followed: null,
      };
    }

    const { data: newAnalysis, error: insertError } = await supabaseAdmin
      .from("run_analyses")
      .insert({
        id: randomUUID(),
        user_id: user.id,
        strava_activity_id: activityId,
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
        run_summary_json,
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
      previous_run_context: previousRunSummary
        ? { date: previousRunSummary.date, distance_km: previousRunSummary.distance_km }
        : null,
    });
  } catch (error) {
    console.error("Error in /api/analyse-run:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
