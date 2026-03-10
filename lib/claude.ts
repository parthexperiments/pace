import Anthropic from "@anthropic-ai/sdk";
import type { RunAnalysis, User } from "@/lib/types";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY environment variable");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface RunCoachingAnalysis {
  run_type_confirmed?: string;
  key_insight: string;
  previous_run_assessment: string | null;
  coach_paragraphs: string[];
  performance_vs_plan: string;
  one_thing: string;
  /** Legacy shape compatibility */
  honest_numbers?: { summary: string };
  km_by_km?: { summary: string };
  the_one_thing?: { cue: string };
  coach_debrief?: { paragraphs: string[] };
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
    run.walking_pct != null ||
    run.stopped_pct != null
      ? {
          running_pct: run.running_pct,
          walking_pct: run.walking_pct,
          stopped_pct: run.stopped_pct,
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

export interface PreviousRunSummary {
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
}

export async function generateRunCoachingAnalysis(params: {
  run: RunAnalysis;
  previousRun: Pick<RunAnalysis, "moving_pace_s" | "overall_pace_s"> | null;
  user: User | null;
  previousRunSummary?: PreviousRunSummary | null;
}): Promise<RunCoachingAnalysis> {
  const minifiedPayload = buildRunPayload(params);
  
  const { user, previousRunSummary } = params;
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
    "You are an expert running coach with memory of this runner's history. " +
    "Your job is to find what is most significant in this run's data relative to their goal and their previous performance.\n\n" +
    "Do not look for a fixed set of patterns. Look at what the numbers are actually saying. " +
    "Consider: pace consistency, effort distribution, distance relative to goal, how this compares to previous runs of the same type, and whether previous recommendations were followed.\n\n" +
    "Be specific. Always reference actual numbers. Never give generic advice. " +
    "If stopped_pct < 0.10 do not mention stopping. " +
    "If stopped_pct >= 0.10 quantify exactly what stopping cost them in time per km. " +
    "Respond in valid JSON only.";

  const run = params.run;
  const stoppedPct = run.stopped_pct ?? 0;
  const distanceKm = run.distance_m != null ? run.distance_m / 1000 : 0;
  const todayRunData: Record<string, unknown> = {
    run_type: run.run_type,
    distance_km: distanceKm,
    overall_pace_s: run.overall_pace_s,
    running_pct: `${((run.running_pct ?? 0) * 100).toFixed(1)}%`,
    walking_pct: `${((run.walking_pct ?? 0) * 100).toFixed(1)}%`,
    km_splits: run.km_splits_json,
    elevation: run.elevation_json,
  };
  if (stoppedPct > 0.1) {
    todayRunData.moving_pace_s = run.moving_pace_s;
    todayRunData.pace_gap_s = run.pace_gap_s;
    todayRunData.stopped_pct = `${(stoppedPct * 100).toFixed(1)}%`;
  }

  let previousRunBlock = "";
  if (previousRunSummary) {
    const fol =
      previousRunSummary.recommendation_followed === true
        ? "true"
        : previousRunSummary.recommendation_followed === false
        ? "false"
        : "unknown";
    previousRunBlock =
      `PREVIOUS ${previousRunSummary.run_type.toUpperCase()} RUN (${previousRunSummary.date}):\n` +
      `distance: ${previousRunSummary.distance_km}km, overall pace: ${Math.floor(previousRunSummary.overall_pace_s / 60)}:${(previousRunSummary.overall_pace_s % 60).toString().padStart(2, "0")}/km\n` +
      `running %: ${(previousRunSummary.running_pct * 100).toFixed(1)}%, walking %: ${(previousRunSummary.walking_pct * 100).toFixed(1)}%, stopped %: ${(previousRunSummary.stopped_pct * 100).toFixed(1)}%\n` +
      `insights: ${JSON.stringify(previousRunSummary.insights)}\n` +
      `recommendation was: ${previousRunSummary.recommendation}\n` +
      `followed: ${fol}\n\n`;
  } else {
    previousRunBlock = `This is the first ${params.run.run_type ?? "this type of"} run we have data for. Establish a baseline assessment. Set "previous_run_assessment" to null.\n\n`;
  }

  const weeksToGoal = user?.goal_date
    ? Math.ceil(
        (new Date(user.goal_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
      )
    : 12;

  const userPrompt =
    `Runner profile:\n` +
    `goal: ${goalContext || "not set"} by ${user?.goal_date ?? "no date"}\n` +
    `weeks to goal: ${weeksToGoal}\n\n` +
    previousRunBlock +
    `TODAY'S RUN DATA:\n${JSON.stringify(todayRunData)}\n\n` +
    "Find what matters most. Return JSON:\n" +
    "{\n" +
    '  "run_type_confirmed": string,\n' +
    '  "key_insight": string,\n' +
    '  "previous_run_assessment": string | null,\n' +
    '  "coach_paragraphs": [string, string, string],\n' +
    '  "performance_vs_plan": string,\n' +
    '  "one_thing": string\n' +
    "}";

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
    const raw = JSON.parse(cleanedText) as Record<string, unknown>;
    const coachParagraphs = Array.isArray(raw.coach_paragraphs)
      ? raw.coach_paragraphs.map(String)
      : [];
    parsed = {
      run_type_confirmed: raw.run_type_confirmed != null ? String(raw.run_type_confirmed) : undefined,
      key_insight: raw.key_insight != null ? String(raw.key_insight) : "",
      previous_run_assessment: raw.previous_run_assessment != null ? String(raw.previous_run_assessment) : null,
      coach_paragraphs: coachParagraphs,
      performance_vs_plan: raw.performance_vs_plan != null ? String(raw.performance_vs_plan) : "",
      one_thing: raw.one_thing != null ? String(raw.one_thing) : "",
      coach_debrief: { paragraphs: coachParagraphs },
      the_one_thing: { cue: raw.one_thing != null ? String(raw.one_thing) : "" },
    };
  } catch (err) {
    console.error("Failed to parse Claude response:", cleanedText);
    throw new Error("Claude response was not valid JSON");
  }

  return parsed;
}

/** Second small Claude call: extract insights array + single recommendation for run_summary_json */
export async function extractRunSummaryFromAnalysis(analysis: RunCoachingAnalysis): Promise<{
  insights: string[];
  recommendation: string;
}> {
  const systemPrompt =
    "Summarise this run analysis as JSON only. No prose outside JSON.";
  const userPrompt =
    "Extract from this analysis:\n" +
    "- All key insights as a string array (no truncation)\n" +
    "- The single most important recommendation for next run of this type\n" +
    'Return JSON: { "insights": string[], "recommendation": string }';

  const analysisStr = JSON.stringify(analysis);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    temperature: 0.2,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt + "\n\nAnalysis:\n" + analysisStr },
        ],
      },
    ],
  });

  const text =
    response.content.length > 0 && response.content[0].type === "text"
      ? response.content[0].text
      : "{}";
  let cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  try {
    const parsed = JSON.parse(cleaned) as { insights: string[]; recommendation: string };
    return {
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : "",
    };
  } catch {
    return { insights: [], recommendation: "" };
  }
}

