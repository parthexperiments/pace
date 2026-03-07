import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { goal_distance, custom_distance_km, goal_date } = await req.json();

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
      .select("distance_m")
      .eq("user_id", session.user.id)
      .order("distance_m", { ascending: false })
      .limit(1);

    const longestRunKm = runs && runs.length > 0 ? runs[0].distance_m / 1000 : 0;

    const today = new Date();
    const goalDateObj = new Date(goal_date);
    const daysToGoal = Math.floor(
      (goalDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const weeksToGoal = daysToGoal / 7;

    const isTightDeadline =
      longestRunKm < goalDistanceKm * 0.6 && weeksToGoal < 3;

    if (!isTightDeadline) {
      return NextResponse.json({ showWarning: false });
    }

    const systemPrompt =
      "You are a running coach giving honest assessments. Write a clear, direct warning message. Max 50 words.";

    const userPrompt = `Write a warning message for this situation:

RUNNER DATA:
- Goal distance: ${goalDistanceKm}km
- Longest run to date: ${longestRunKm.toFixed(1)}km
- Weeks until goal: ${weeksToGoal.toFixed(1)}

The runner needs to add ${(goalDistanceKm - longestRunKm).toFixed(
      1
    )}km in a very short timeframe.

Return ONLY the warning message text (max 50 words), no JSON formatting.`;

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const warningText =
        message.content[0].type === "text"
          ? message.content[0].text
          : `Your longest run is ${longestRunKm.toFixed(
              1
            )}km. A ${goalDistanceKm}km race in ${weeksToGoal.toFixed(
              1
            )} weeks means adding ${(goalDistanceKm - longestRunKm).toFixed(
              1
            )}km in one race. We'll build the most aggressive safe plan — but consider this a strong training run rather than a full race attempt.`;

      return NextResponse.json({
        showWarning: true,
        message: warningText,
      });
    } catch (error) {
      console.error("Claude API error for warning:", error);
      return NextResponse.json({
        showWarning: true,
        message: `Your longest run is ${longestRunKm.toFixed(
          1
        )}km. A ${goalDistanceKm}km race in ${weeksToGoal.toFixed(
          1
        )} weeks is very ambitious. We'll build the most aggressive safe plan — but consider adjusting your expectations.`,
      });
    }
  } catch (error) {
    console.error("Error in check-deadline-warning:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
