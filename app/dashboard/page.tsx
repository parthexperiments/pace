"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

interface User {
  id: string;
  name: string | null;
  goal_distance: string | null;
  custom_distance_km: number | null;
  goal_type: string | null;
  goal_pace_seconds: number | null;
  goal_time_seconds: number | null;
  deadline_type: string | null;
  goal_date: string | null;
  available_days: string[] | null;
}

interface RunAnalysis {
  id: string;
  strava_activity_id: number;
  run_date: string;
  distance_m: number;
  moving_pace_s: number;
  overall_pace_s: number;
  pace_gap_s: number;
  running_pct: number;
  analysis_json: {
    key_insight?: { summary: string };
  };
}

interface DayPlan {
  day: string;
  type: string;
  label: string;
  distance_km: number | null;
  target_pace_min_s: number | null;
  target_pace_max_s: number | null;
  focus_cue: string | null;
}

interface PreRunBrief {
  focus_cue: string;
  pacing_strategy: string;
  warmup: string[];
  mental_cue: string;
}

interface WeeklyPlan {
  coach_tip: string;
  days: DayPlan[];
}

interface Plan {
  id: string;
  week_start_date: string;
  plan_json: WeeklyPlan;
}

interface DashboardData {
  user: User;
  todayRun: RunAnalysis | null;
  lastRun: RunAnalysis | null;
  weeklyRuns: number;
  weeklyPlanExists: boolean;
}

type DashboardState = "rest" | "pre-run" | "post-run-synced" | "loading";

function formatPace(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)}km`;
}

function getDayOfWeek(): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[new Date().getDay()];
}

function getDaysToGoal(goalDate: string | null): number | null {
  if (!goalDate) return null;
  const today = new Date();
  const goal = new Date(goalDate);
  const diffTime = goal.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getGoalLabel(
  goalDistance: string | null,
  customDistanceKm: number | null
): string {
  const labels: Record<string, string> = {
    "5k": "5K",
    "10k": "10K",
    half: "Half Marathon",
    full: "Full Marathon",
  };
  if (goalDistance === "custom" && customDistanceKm) {
    return `${customDistanceKm}km`;
  }
  return labels[goalDistance || ""] || "";
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [brief, setBrief] = useState<PreRunBrief | null>(null);
  const [todaysPlan, setTodaysPlan] = useState<DayPlan | null>(null);
  const [state, setState] = useState<DashboardState>("loading");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "authenticated") {
      fetchDashboardData();
      fetchPlan();
      fetchPreRunBrief();
      autoSyncInBackground();
    }
  }, [status, router]);

  const autoSyncInBackground = async () => {
    try {
      const res = await fetch("/api/auto-sync", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        if (result.newRuns > 0) {
          setToastMessage(
            `${result.newRuns} new ${
              result.newRuns === 1 ? "run" : "runs"
            } detected and analyzed`
          );
          setTimeout(() => setToastMessage(null), 5000);
          fetchDashboardData();
        }
      }
    } catch (error) {
      console.error("Auto-sync error:", error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      const dashboardData = await res.json();
      setData(dashboardData);
      determineDashboardState(dashboardData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };

  const fetchPlan = async () => {
    try {
      const res = await fetch("/api/get-plan");
      if (!res.ok) throw new Error("Failed to fetch plan");
      const planData = await res.json();
      setPlan(planData.plan);
    } catch (error) {
      console.error("Error fetching plan:", error);
    }
  };

  const fetchPreRunBrief = async () => {
    try {
      const res = await fetch("/api/pre-run-brief");
      if (!res.ok) return;
      const briefData = await res.json();
      
      if (briefData.isRunDay && briefData.brief) {
        setBrief(briefData.brief);
        setTodaysPlan(briefData.todaysPlan);
      }
    } catch (error) {
      console.error("Error fetching pre-run brief:", error);
    }
  };

  const handleGeneratePlan = async () => {
    try {
      setGeneratingPlan(true);
      const res = await fetch("/api/generate-plan", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate plan");
      const planData = await res.json();
      setPlan(planData.plan);
    } catch (error) {
      console.error("Error generating plan:", error);
      alert("Failed to generate plan. Please try again.");
    } finally {
      setGeneratingPlan(false);
    }
  };

  const determineDashboardState = (dashboardData: DashboardData) => {
    const today = getDayOfWeek();
    const isRunDay = dashboardData.user.available_days?.includes(today);

    if (dashboardData.todayRun) {
      setState("post-run-synced");
    } else if (isRunDay) {
      setState("pre-run");
    } else {
      setState("rest");
    }
  };

  if (status === "loading" || state === "loading" || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-[#E8521A]" />
      </main>
    );
  }

  const daysToGoal = getDaysToGoal(data.user.goal_date);
  const goalLabel = getGoalLabel(
    data.user.goal_distance,
    data.user.custom_distance_km
  );

  return (
    <main className="min-h-screen bg-[#0A0A0A] px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {data.user.name || "Runner"}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Goal: {goalLabel}
              {data.user.goal_date && ` by ${new Date(data.user.goal_date).toLocaleDateString()}`}
            </p>
            <div className="mt-3 flex gap-4">
              <button
                onClick={() => router.push("/plan")}
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                Weekly Plan
              </button>
              <button
                onClick={() => router.push("/progress")}
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                Progress →
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-sm text-zinc-500 hover:text-zinc-400"
          >
            Sign out
          </button>
        </div>

        {daysToGoal !== null && daysToGoal >= 0 && (
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm text-zinc-400">Days to goal</p>
            <p className="mt-1 text-3xl font-bold text-[#E8521A]">{daysToGoal}</p>
          </div>
        )}

        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-zinc-400">Weekly Progress</p>
            <p className="text-sm text-zinc-400">
              {data.weeklyRuns} / {data.user.available_days?.length || 0} runs
            </p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-[#E8521A] transition-all"
              style={{
                width: `${((data.weeklyRuns / (data.user.available_days?.length || 1)) * 100).toFixed(0)}%`,
              }}
            />
          </div>
        </div>

        {!plan && (
          <div className="mb-6 rounded-lg border-2 border-[#E8521A]/30 bg-gradient-to-br from-[#E8521A]/10 to-zinc-900 p-6">
            <h3 className="text-lg font-semibold text-white">No Training Plan Yet</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Generate your personalized weekly training plan based on your goal and availability.
            </p>
            <button
              onClick={handleGeneratePlan}
              disabled={generatingPlan}
              className="mt-4 rounded-lg bg-[#E8521A] px-6 py-3 font-medium text-white transition-colors hover:bg-[#d14715] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generatingPlan ? "Generating Plan..." : "Generate My Weekly Plan"}
            </button>
          </div>
        )}

        {plan && (
          <div className="mb-6">
            <button
              onClick={() => router.push("/plan")}
              className="text-sm text-zinc-400 hover:text-zinc-300"
            >
              View Full Weekly Plan →
            </button>
          </div>
        )}

        {state === "rest" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-2xl font-bold text-white">Rest Day</h2>
              <p className="mt-2 text-zinc-400">Recovery is part of the process</p>
              {plan?.plan_json?.coach_tip && (
                <p className="mt-4 text-sm text-zinc-300">
                  💡 {plan.plan_json.coach_tip}
                </p>
              )}
            </div>

            {data.lastRun && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
                <h3 className="text-lg font-semibold text-white">Last Run</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-zinc-400">Distance</p>
                    <p className="mt-1 text-xl font-bold text-white">
                      {formatDistance(data.lastRun.distance_m)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Moving Pace</p>
                    <p className="mt-1 text-xl font-bold text-white">
                      {formatPace(data.lastRun.moving_pace_s)}/km
                    </p>
                  </div>
                </div>
                {data.lastRun.analysis_json?.key_insight?.summary && (
                  <p className="mt-4 text-sm text-zinc-300">
                    {data.lastRun.analysis_json.key_insight.summary}
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="text-lg font-semibold text-white">Mobility Routine</h3>
              <ul className="mt-4 space-y-2">
                <li className="text-zinc-300">• Hip flexor stretch (30s each side)</li>
                <li className="text-zinc-300">• Calf stretch (30s each side)</li>
                <li className="text-zinc-300">• Quad stretch (30s each side)</li>
                <li className="text-zinc-300">• Hamstring stretch (30s each side)</li>
                <li className="text-zinc-300">• Glute stretch (30s each side)</li>
              </ul>
            </div>
          </div>
        )}

        {state === "pre-run" && (
          <div className="space-y-6">
            {!plan ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
                  <h2 className="text-2xl font-bold text-white">Generate Your Week 1 Plan</h2>
                  <p className="mt-2 text-zinc-300">
                    Let me create a personalized training plan based on your goal and availability.
                  </p>
                </div>
                <button
                  onClick={handleGeneratePlan}
                  disabled={generatingPlan}
                  className="w-full rounded-lg bg-[#E8521A] px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-[#d14715] disabled:opacity-50"
                >
                  {generatingPlan ? "Generating..." : "Generate Plan"}
                </button>
              </div>
            ) : todaysPlan && brief ? (
              <>
                <div className="rounded-lg border-2 border-[#E8521A] bg-gradient-to-br from-[#E8521A]/10 to-zinc-900 p-8">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="rounded-full bg-[#E8521A] px-3 py-1 text-sm font-medium uppercase text-white">
                      {todaysPlan.type}
                    </span>
                    <h2 className="text-2xl font-bold text-white">Today's Run</h2>
                  </div>

                  <p className="text-lg font-medium text-zinc-200">
                    {todaysPlan.label}
                  </p>

                  {todaysPlan.distance_km && (
                    <div className="mt-6 flex flex-wrap gap-6">
                      <div>
                        <p className="text-sm text-zinc-400">Distance</p>
                        <p className="text-2xl font-bold text-white">
                          {todaysPlan.distance_km.toFixed(1)}km
                        </p>
                      </div>
                      {todaysPlan.target_pace_min_s && todaysPlan.target_pace_max_s && (
                        <div>
                          <p className="text-sm text-zinc-400">Target Pace</p>
                          <p className="text-2xl font-bold text-white">
                            {formatPace(todaysPlan.target_pace_min_s)} -{" "}
                            {formatPace(todaysPlan.target_pace_max_s)}/km
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-8 space-y-6">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-[#E8521A]">
                        Your focus today
                      </p>
                      <p className="mt-2 text-xl italic text-zinc-100">
                        {brief.focus_cue}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-zinc-400">
                        Pacing strategy
                      </p>
                      <p className="mt-2 text-zinc-200">{brief.pacing_strategy}</p>
                    </div>

                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-zinc-400">
                        Remember
                      </p>
                      <p className="mt-2 text-2xl font-bold text-white">
                        "{brief.mental_cue}"
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-zinc-400">
                        Warm-up (do this before you leave)
                      </p>
                      <ul className="mt-3 space-y-2">
                        {brief.warmup.map((exercise, idx) => (
                          <li key={idx} className="text-zinc-300">
                            • {exercise}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={() => router.push("/plan")}
                    className="mt-6 text-sm text-zinc-400 hover:text-zinc-300"
                  >
                    View Full Plan →
                  </button>
                </div>

                <button
                  onClick={() => router.push("/sync")}
                  className="w-full rounded-lg bg-[#E8521A] px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-[#d14715]"
                >
                  I've completed my run
                </button>
              </>
            ) : (
              <>
                {(() => {
                  const today = getDayOfWeek().toLowerCase();
                  const todayPlan = plan.plan_json.days.find(
                    (d) => d.day.toLowerCase() === today
                  );

                  if (!todayPlan) {
                    return (
                      <div className="rounded-lg border-2 border-[#E8521A] bg-gradient-to-br from-[#E8521A]/10 to-zinc-900 p-6">
                        <h2 className="text-2xl font-bold text-white">Today's Run</h2>
                        <p className="mt-4 text-zinc-300">
                          No specific plan for today. Aim for an easy run at a comfortable pace.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="rounded-lg border-2 border-[#E8521A] bg-gradient-to-br from-[#E8521A]/10 to-zinc-900 p-6">
                      <h2 className="text-2xl font-bold text-white">Today's Run</h2>
                      <p className="mt-2 text-lg font-medium text-zinc-300">
                        {todayPlan.label}
                      </p>
                      
                      {todayPlan.distance_km && (
                        <div className="mt-4 flex flex-wrap gap-4">
                          <div>
                            <p className="text-sm text-zinc-400">Distance</p>
                            <p className="text-xl font-bold text-white">
                              {todayPlan.distance_km.toFixed(1)}km
                            </p>
                          </div>
                          {todayPlan.target_pace_min_s && todayPlan.target_pace_max_s && (
                            <div>
                              <p className="text-sm text-zinc-400">Target Pace</p>
                              <p className="text-xl font-bold text-white">
                                {formatPace(todayPlan.target_pace_min_s)} -{" "}
                                {formatPace(todayPlan.target_pace_max_s)}/km
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {todayPlan.focus_cue && (
                        <p className="mt-4 italic text-zinc-300">
                          {todayPlan.focus_cue}
                        </p>
                      )}

                      <button
                        onClick={() => router.push("/plan")}
                        className="mt-4 text-sm text-zinc-400 hover:text-zinc-300"
                      >
                        View Full Plan →
                      </button>
                    </div>
                  );
                })()}

                <button
                  onClick={() => router.push("/sync")}
                  className="w-full rounded-lg bg-[#E8521A] px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-[#d14715]"
                >
                  I've completed my run
                </button>
              </>
            )}
          </div>
        )}

        {state === "post-run-synced" && data.todayRun && (
          <div className="space-y-6">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-2xl font-bold text-white">Run Analysed</h2>
              <p className="mt-2 text-sm text-zinc-400">
                {new Date(data.todayRun.run_date).toLocaleDateString("en-GB", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-zinc-400">Distance</p>
                  <p className="mt-1 text-xl font-bold text-white">
                    {formatDistance(data.todayRun.distance_m)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Moving Pace</p>
                  <p className="mt-1 text-xl font-bold text-white">
                    {formatPace(data.todayRun.moving_pace_s)}/km
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Running %</p>
                  <p className="mt-1 text-xl font-bold text-white">
                    {(data.todayRun.running_pct * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              {data.todayRun.analysis_json?.key_insight?.summary && (
                <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
                  <p className="text-sm font-medium text-zinc-300">
                    {data.todayRun.analysis_json.key_insight.summary}
                  </p>
                </div>
              )}

              <button
                onClick={() =>
                  router.push(`/analysis/${data.todayRun!.strava_activity_id}`)
                }
                className="mt-6 w-full rounded-lg bg-[#E8521A] px-6 py-3 font-medium text-white transition-colors hover:bg-[#d14715]"
              >
                See Full Analysis
              </button>
            </div>
          </div>
        )}
      </div>

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="rounded-lg border border-[#E8521A]/30 bg-zinc-900 px-6 py-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8521A]/20">
                <svg
                  className="h-5 w-5 text-[#E8521A]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-white">{toastMessage}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
