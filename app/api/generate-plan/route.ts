import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function getMondayOfCurrentWeek(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  return monday.toISOString().split("T")[0];
}

function getWeeksToGoal(goalDate: string | null): number {
  if (!goalDate) return 12;
  const today = new Date();
  const goal = new Date(goalDate);
  const diffTime = goal.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.ceil(diffDays / 7);
}

function getCurrentPhase(weeksToGoal: number): string {
  if (weeksToGoal > 6) return "base_building";
  if (weeksToGoal >= 3) return "build";
  if (weeksToGoal === 2) return "peak";
  return "taper";
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select(
        "id, goal_distance, custom_distance_km, goal_type, goal_pace_seconds, goal_time_seconds, goal_date, available_days"
      )
      .eq("id", session.user.id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const mondayOfWeek = getMondayOfCurrentWeek();

    const { data: existingPlan } = await supabaseAdmin
      .from("weekly_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start_date", mondayOfWeek)
      .maybeSingle();

    if (existingPlan) {
      return NextResponse.json({
        plan: existingPlan,
        cached: true,
      });
    }

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0];

    const { data: recentRuns } = await supabaseAdmin
      .from("run_analyses")
      .select("run_date, distance_m, moving_pace_s, running_pct")
      .eq("user_id", user.id)
      .gte("run_date", fourWeeksAgoStr)
      .order("run_date", { ascending: true });

    const weeklyHistory = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (28 - i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekStartStr = weekStart.toISOString().split("T")[0];
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      const weekRuns =
        recentRuns?.filter(
          (r) => r.run_date >= weekStartStr && r.run_date <= weekEndStr
        ) || [];

      if (weekRuns.length > 0) {
        weeklyHistory.push({
          week: i + 1,
          runs: weekRuns.length,
          total_km: weekRuns.reduce((sum, r) => sum + (r.distance_m || 0) / 1000, 0),
          long_run_km: Math.max(...weekRuns.map((r) => (r.distance_m || 0) / 1000)),
          avg_moving_pace_s:
            weekRuns.reduce((sum, r) => sum + (r.moving_pace_s || 0), 0) /
            weekRuns.length,
          avg_running_pct:
            weekRuns.reduce((sum, r) => sum + (r.running_pct || 0), 0) /
            weekRuns.length,
        });
      }
    }

    const weeksToGoal = getWeeksToGoal(user.goal_date);
    const currentPhase = getCurrentPhase(weeksToGoal);

    const systemPrompt =
      "You are an expert running coach. Generate a weekly training plan as JSON only. " +
      "No prose outside JSON. Be specific with distances and paces. " +
      "Every run day must have a clear purpose.";

    const userPrompt =
      `Generate a 7-day training plan for this runner.\n\n` +
      `RUNNER PROFILE:\n` +
      `goal_distance: ${user.goal_distance}\n` +
      `goal_pace_s: ${user.goal_pace_seconds || "not set"}\n` +
      `available_days: ${JSON.stringify(user.available_days)}\n` +
      `weeks_to_goal: ${weeksToGoal}\n` +
      `current_phase: ${currentPhase}\n\n` +
      `LAST 4 WEEKS TRAINING:\n` +
      `${JSON.stringify(weeklyHistory)}\n\n` +
      `Return JSON exactly:\n` +
      `{\n` +
      `  week_number: integer,\n` +
      `  phase: string,\n` +
      `  coach_tip: string (max 40 words, specific to this runner),\n` +
      `  days: [\n` +
      `    {\n` +
      `      day: "monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday",\n` +
      `      type: "rest"|"easy"|"tempo"|"long"|"strength"|"cross",\n` +
      `      label: string,\n` +
      `      distance_km: number or null,\n` +
      `      target_pace_min_s: number or null,\n` +
      `      target_pace_max_s: number or null,\n` +
      `      focus_cue: string (max 20 words, null for rest days),\n` +
      `      exercises: [] (only for strength days)\n` +
      `    }\n` +
      `  ]\n` +
      `}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const text =
      response.content.length > 0 && response.content[0].type === "text"
        ? response.content[0].text
        : "";

    let cleanedText = text.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.replace(/^```json\s*/, "").replace(/```\s*$/, "");
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }

    let planJson;
    try {
      planJson = JSON.parse(cleanedText);
    } catch (err) {
      console.error("Failed to parse Claude plan response:", cleanedText);
      throw new Error("Claude response was not valid JSON");
    }

    const { data: newPlan, error: insertError } = await supabaseAdmin
      .from("weekly_plans")
      .insert({
        id: randomUUID(),
        user_id: user.id,
        week_start_date: mondayOfWeek,
        plan_json: planJson,
        coach_tip: planJson.coach_tip || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert plan:", insertError);
      return NextResponse.json(
        { error: "Failed to save plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      plan: newPlan,
      cached: false,
    });
  } catch (error) {
    console.error("Error in /api/generate-plan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
