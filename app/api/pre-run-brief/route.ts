import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

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

function getDayOfWeek(): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, goal_pace_seconds, available_days")
      .eq("id", session.user.id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const today = getDayOfWeek();
    const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1);
    
    const isRunDay = user.available_days?.some(
      (day: string) => day.toLowerCase() === today || day === todayCapitalized
    );

    if (!isRunDay) {
      return NextResponse.json({ isRunDay: false });
    }

    const mondayOfWeek = getMondayOfCurrentWeek();

    const { data: weeklyPlan, error: planError } = await supabaseAdmin
      .from("weekly_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start_date", mondayOfWeek)
      .maybeSingle();

    if (planError || !weeklyPlan) {
      return NextResponse.json({
        isRunDay: true,
        todaysPlan: null,
        brief: null,
        message: "No weekly plan found. Generate a plan first.",
      });
    }

    const planJson = weeklyPlan.plan_json as any;
    const todaysPlan = planJson.days?.find(
      (d: any) => d.day.toLowerCase() === today
    );

    if (!todaysPlan || todaysPlan.type === "rest") {
      return NextResponse.json({ isRunDay: false });
    }

    if (planJson.pre_run_brief) {
      return NextResponse.json({
        isRunDay: true,
        todaysPlan,
        brief: planJson.pre_run_brief,
        cached: true,
      });
    }

    const { data: recentRuns, error: runsError } = await supabaseAdmin
      .from("run_analyses")
      .select("distance_m, moving_pace_s, running_pct, km_splits_json")
      .eq("user_id", user.id)
      .order("run_date", { ascending: false })
      .limit(3);

    if (runsError) {
      console.error("Failed to fetch recent runs:", runsError);
    }

    let patterns = {
      started_too_fast: false,
      faded_last_third: false,
      running_pct_trending: "flat" as "up" | "down" | "flat",
      avg_first_km_pace_s: 0,
    };

    if (recentRuns && recentRuns.length > 0) {
      const goalPace = user.goal_pace_seconds || 360;
      let firstKmPaces: number[] = [];
      let startedFastCount = 0;
      let fadedCount = 0;

      recentRuns.forEach((run) => {
        const kmSplits = (run.km_splits_json as any[]) || [];
        if (kmSplits.length > 0) {
          const firstKm = kmSplits[0];
          if (firstKm && firstKm.pace_s) {
            firstKmPaces.push(firstKm.pace_s);
            if (firstKm.pace_s < goalPace * 0.95) {
              startedFastCount++;
            }
          }

          if (kmSplits.length >= 6) {
            const firstThird = kmSplits.slice(0, Math.floor(kmSplits.length / 3));
            const lastThird = kmSplits.slice(-Math.floor(kmSplits.length / 3));
            
            const avgFirstThird =
              firstThird.reduce((sum, s) => sum + (s.pace_s || 0), 0) / firstThird.length;
            const avgLastThird =
              lastThird.reduce((sum, s) => sum + (s.pace_s || 0), 0) / lastThird.length;

            if (avgLastThird - avgFirstThird > 30) {
              fadedCount++;
            }
          }
        }
      });

      patterns.started_too_fast = startedFastCount >= 2;
      patterns.faded_last_third = fadedCount >= 2;
      patterns.avg_first_km_pace_s =
        firstKmPaces.length > 0
          ? firstKmPaces.reduce((sum, p) => sum + p, 0) / firstKmPaces.length
          : 0;

      if (recentRuns.length >= 2) {
        const latestPct = recentRuns[0].running_pct || 0;
        const olderPct = recentRuns[recentRuns.length - 1].running_pct || 0;
        const diff = latestPct - olderPct;
        
        if (diff > 0.05) patterns.running_pct_trending = "up";
        else if (diff < -0.05) patterns.running_pct_trending = "down";
        else patterns.running_pct_trending = "flat";
      }
    }

    const systemPrompt =
      "You are a running coach writing a pre-run brief. " +
      "Be specific and direct. Reference actual data patterns. " +
      "Never give generic advice. Always respond in JSON only.";

    const userPrompt =
      `Write a pre-run brief for today's run.\n\n` +
      `TODAY'S RUN:\n` +
      `type: ${todaysPlan.type}\n` +
      `distance_km: ${todaysPlan.distance_km}\n` +
      `target_pace_min_s: ${todaysPlan.target_pace_min_s}\n` +
      `target_pace_max_s: ${todaysPlan.target_pace_max_s}\n\n` +
      `RUNNER PATTERNS FROM LAST 3 RUNS:\n` +
      `started_too_fast: ${patterns.started_too_fast}\n` +
      `faded_last_third: ${patterns.faded_last_third}\n` +
      `running_pct_trending: ${patterns.running_pct_trending}\n` +
      `avg_first_km_pace_s: ${Math.round(patterns.avg_first_km_pace_s)}\n` +
      `goal_pace_s: ${user.goal_pace_seconds || 360}\n\n` +
      `Return JSON:\n` +
      `{\n` +
      `  focus_cue: string (max 25 words, references a specific pattern from the data — never generic),\n` +
      `  pacing_strategy: string (max 20 words),\n` +
      `  warmup: [5 specific dynamic stretches for this run type],\n` +
      `  mental_cue: string (one short phrase to repeat during run)\n` +
      `}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
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

    let brief;
    try {
      brief = JSON.parse(cleanedText);
    } catch (err) {
      console.error("Failed to parse Claude brief response:", cleanedText);
      throw new Error("Claude response was not valid JSON");
    }

    planJson.pre_run_brief = brief;

    await supabaseAdmin
      .from("weekly_plans")
      .update({ plan_json: planJson })
      .eq("id", weeklyPlan.id);

    return NextResponse.json({
      isRunDay: true,
      todaysPlan,
      brief,
      cached: false,
    });
  } catch (error) {
    console.error("Error in /api/pre-run-brief:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
