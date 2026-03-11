import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";

function getMondayOfCurrentWeek(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  return monday.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select(
        "id, name, goal_distance, custom_distance_km, goal_type, goal_pace_seconds, goal_time_seconds, deadline_type, goal_date, available_days"
      )
      .eq("id", session.user.id)
      .single();

    if (userError || !user) {
      console.error("Failed to fetch user:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const today = new Date().toISOString().split("T")[0];

    const { data: todayRun } = await supabaseAdmin
      .from("run_analyses")
      .select(
        "id, strava_activity_id, run_date, distance_m, moving_pace_s, overall_pace_s, pace_gap_s, running_pct, analysis_json"
      )
      .eq("user_id", user.id)
      .eq("run_date", today)
      .maybeSingle();

    const { data: lastRun } = await supabaseAdmin
      .from("run_analyses")
      .select(
        "id, strava_activity_id, run_date, distance_m, moving_pace_s, overall_pace_s, pace_gap_s, running_pct, walking_pct, stopped_pct, analysis_json"
      )
      .eq("user_id", user.id)
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const mondayOfWeek = getMondayOfCurrentWeek();
    const { data: weeklyRuns } = await supabaseAdmin
      .from("run_analyses")
      .select("id")
      .eq("user_id", user.id)
      .gte("run_date", mondayOfWeek)
      .lte("run_date", today);

    const { data: weeklyPlan } = await supabaseAdmin
      .from("weekly_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("week_start_date", mondayOfWeek)
      .maybeSingle();

    const { count: totalRuns } = await supabaseAdmin
      .from("run_analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    return NextResponse.json({
      user,
      todayRun: todayRun || null,
      lastRun: lastRun || null,
      weeklyRuns: weeklyRuns?.length || 0,
      weeklyPlanExists: !!weeklyPlan,
      totalRuns: totalRuns ?? 0,
    });
  } catch (error) {
    console.error("Error in /api/dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
