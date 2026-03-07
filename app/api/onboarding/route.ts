import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      goal_distance,
      custom_distance_km,
      goal_type,
      goal_time_seconds,
      goal_pace_seconds,
      deadline_type,
      goal_date,
      available_days,
    } = body;

    let finalGoalDate = goal_date;
    let aiReasoning = null;

    if (deadline_type === "ai_recommended") {
      const goalDistanceKm =
        goal_distance === "custom"
          ? custom_distance_km
          : goal_distance === "5k"
          ? 5
          : goal_distance === "10k"
          ? 10
          : goal_distance === "half"
          ? 21.1
          : goal_distance === "full"
          ? 42.2
          : 10;

      const { data: runs } = await supabaseAdmin
        .from("run_analyses")
        .select("distance_m, moving_pace_s, run_date")
        .eq("user_id", session.user.id)
        .order("run_date", { ascending: false })
        .limit(30);

      let longestRunKm = 0;
      let avgWeeklyKm = 0;
      let avgMovingPaceS = 0;

      if (runs && runs.length > 0) {
        longestRunKm = Math.max(...runs.map((r) => r.distance_m / 1000));

        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
        const recentRuns = runs.filter(
          (r) => new Date(r.run_date) >= fourWeeksAgo
        );

        if (recentRuns.length > 0) {
          const totalKm = recentRuns.reduce(
            (sum, r) => sum + r.distance_m / 1000,
            0
          );
          avgWeeklyKm = totalKm / 4;

          avgMovingPaceS =
            recentRuns.reduce((sum, r) => sum + r.moving_pace_s, 0) /
            recentRuns.length;
        }
      }

      const today = new Date().toISOString().split("T")[0];

      const systemPrompt =
        "You are an expert running coach. Recommend a realistic race date as JSON only. No prose outside JSON.";

      const userPrompt = `Recommend a goal date.

RUNNER:
{
  "goal_distance_km": ${goalDistanceKm},
  "longest_run_km": ${longestRunKm},
  "avg_weekly_km": ${avgWeeklyKm.toFixed(1)},
  "avg_moving_pace_s": ${avgMovingPaceS},
  "today": "${today}"
}

Return JSON:
{
  "recommended_date": "YYYY-MM-DD",
  "weeks_from_now": integer,
  "reasoning": "string (max 30 words)"
}`;

      try {
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
          system: systemPrompt,
        });

        const rawContent =
          message.content[0].type === "text" ? message.content[0].text : "{}";

        const cleanedContent = rawContent
          .trim()
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/, "");

        const aiResponse = JSON.parse(cleanedContent);
        finalGoalDate = aiResponse.recommended_date;
        aiReasoning = aiResponse.reasoning;
      } catch (error) {
        console.error("Claude API error for deadline recommendation:", error);
        const defaultWeeks = 12;
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + defaultWeeks * 7);
        finalGoalDate = futureDate.toISOString().split("T")[0];
      }
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({
        goal_distance,
        custom_distance_km,
        goal_type,
        goal_time_seconds,
        goal_pace_seconds,
        deadline_type,
        goal_date: finalGoalDate,
        available_days,
      })
      .eq("id", session.user.id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update user onboarding data:", error);
      return NextResponse.json(
        { error: "Failed to save onboarding data" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: data,
      ai_reasoning: aiReasoning,
    });
  } catch (error) {
    console.error("Error in /api/onboarding:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
