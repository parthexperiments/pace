import Anthropic from "@anthropic-ai/sdk";
import type { RunAnalysis, User } from "@/lib/types";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY environment variable");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface RunCoachingAnalysis {
  honest_numbers: {
    summary: string;
  };
  key_insight: {
    summary: string;
  };
  km_by_km: {
    summary: string;
  };
  performance_vs_plan: {
    summary: string;
  };
  the_one_thing: {
    cue: string;
  };
  coach_debrief: {
    paragraphs: string[];
  };
}

function buildRunPayload(params: {
  run: RunAnalysis;
  previousRun: Pick<RunAnalysis, "moving_pace_s" | "overall_pace_s"> | null;
  user: User | null;
}) {
  const { run, previousRun, user } = params;

  const distance_km =
    run.distance_m != null ? run.distance_m / 1000 : null;

  const speed_distribution =
    run.running_pct != null ||
    run.shuffling_pct != null ||
    run.stationary_pct != null
      ? {
          running_pct: run.running_pct,
          shuffling_pct: run.shuffling_pct,
          stationary_pct: run.stationary_pct,
        }
      : null;

  const km_splits = run.km_splits_json ?? null;
  const elevation = run.elevation_json ?? null;

  const goal =
    user && user.goal_type
      ? {
          goal_distance: user.goal_distance,
          custom_distance_km: user.custom_distance_km,
          goal_type: user.goal_type,
          goal_pace_seconds: user.goal_pace_seconds,
          goal_time_seconds: user.goal_time_seconds,
          deadline_type: user.deadline_type,
          goal_date: user.goal_date,
        }
      : null;

  const payload = {
    run: {
      moving_pace_s: run.moving_pace_s,
      overall_pace_s: run.overall_pace_s,
      moving_time_s: run.moving_time_s,
      elapsed_time_s: run.elapsed_time_s,
      distance_km,
      distance_m: run.distance_m,
      speed_distribution,
      km_splits,
      elevation,
      run_date: run.run_date,
    },
    previous_run: previousRun ?? null,
    goal,
  };

  return JSON.stringify(payload);
}

export async function generateRunCoachingAnalysis(params: {
  run: RunAnalysis;
  previousRun: Pick<RunAnalysis, "moving_pace_s" | "overall_pace_s"> | null;
  user: User | null;
}): Promise<RunCoachingAnalysis> {
  const minifiedPayload = buildRunPayload(params);
  
  const { user } = params;
  let goalContext = "";
  if (user?.goal_distance && user?.goal_type) {
    const distanceLabels: Record<string, string> = {
      "5k": "5K",
      "10k": "10K",
      "half": "Half Marathon",
      "full": "Full Marathon",
      "custom": `${user.custom_distance_km}km`
    };
    const distanceLabel = distanceLabels[user.goal_distance] || user.goal_distance;
    
    goalContext = `Runner goal: ${distanceLabel}`;
    
    if (user.goal_type === "pace" && user.goal_pace_seconds) {
      const mins = Math.floor(user.goal_pace_seconds / 60);
      const secs = user.goal_pace_seconds % 60;
      goalContext += `, target pace: ${mins}:${secs.toString().padStart(2, "0")}/km (${user.goal_pace_seconds} seconds/km)`;
    } else if (user.goal_type === "time" && user.goal_time_seconds) {
      const hours = Math.floor(user.goal_time_seconds / 3600);
      const mins = Math.floor((user.goal_time_seconds % 3600) / 60);
      goalContext += `, target time: ${hours}:${mins.toString().padStart(2, "0")}`;
    } else if (user.goal_type === "finish") {
      goalContext += ", goal: just finish";
    }
    
    if (user.goal_date) {
      goalContext += `, race date: ${user.goal_date}`;
    }
  }

  const systemPrompt =
    "You are Pace, an AI running coach. " +
    "You receive preprocessed data about a single run plus optional goal and previous run context. " +
    "Follow these rules strictly: " +
    "1) Never assume or guess WHY a runner's pace changed (no speculation about sleep, stress, weather, etc). " +
    "Only describe patterns you can see in the data. " +
    "2) Keep every coaching paragraph under 80 words. " +
    "3) Always respond with STRICTLY valid JSON, no markdown or prose outside JSON. " +
    "4) Use the provided schema exactly as specified. " +
    "5) When goal data is provided, use it to evaluate performance and provide specific feedback against those targets.";

  const userPrompt =
    (goalContext ? `${goalContext}\n\n` : "") +
    "Here is the preprocessed run payload as compact JSON (no raw Strava streams):\n" +
    minifiedPayload +
    "\n\n" +
    "Using ONLY this data, produce a JSON object with the following shape:\n" +
    "{\n" +
    '  "honest_numbers": {\n' +
    '    "summary": string\n' +
    "  },\n" +
    '  "key_insight": {\n' +
    '    "summary": string\n' +
    "  },\n" +
    '  "km_by_km": {\n' +
    '    "summary": string\n' +
    "  },\n" +
    '  "performance_vs_plan": {\n' +
    '    "summary": string  // Compare this run against the runner\'s goal if provided\n' +
    "  },\n" +
    '  "the_one_thing": {\n' +
    '    "cue": string\n' +
    "  },\n" +
    '  "coach_debrief": {\n' +
    '    "paragraphs": string[]  // 3-4 short paragraphs, each <= 80 words\n' +
    "  }\n" +
    "}\n\n" +
    "Each field should be concise, specific to this run, and avoid generic advice. " +
    "Do not mention Strava or raw data structures, only talk about the run itself.";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    temperature: 0.5,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt,
          },
        ],
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

  let parsed: RunCoachingAnalysis;
  try {
    parsed = JSON.parse(cleanedText) as RunCoachingAnalysis;
  } catch (err) {
    console.error("Failed to parse Claude response:", cleanedText);
    throw new Error("Claude response was not valid JSON");
  }

  return parsed;
}

