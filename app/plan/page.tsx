"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DayPlan {
  day: string;
  type: string;
  label: string;
  distance_km: number | null;
  target_pace_min_s: number | null;
  target_pace_max_s: number | null;
  focus_cue: string | null;
  exercises: string[];
}

interface WeeklyPlan {
  week_number: number;
  phase: string;
  coach_tip: string;
  days: DayPlan[];
}

interface Plan {
  id: string;
  week_start_date: string;
  plan_json: WeeklyPlan;
  coach_tip: string | null;
}

interface RunAnalysis {
  run_date: string;
}

function formatPace(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getDayOfWeek(): string {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[new Date().getDay()];
}

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

export default function PlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [completedDates, setCompletedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetchPlan();
    fetchCompletedRuns();
  }, []);

  const fetchPlan = async () => {
    try {
      const res = await fetch("/api/get-plan");
      const data = await res.json();
      setPlan(data.plan);
    } catch (error) {
      console.error("Error fetching plan:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompletedRuns = async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) return;
      const data = await res.json();
      
      const mondayOfWeek = getMondayOfCurrentWeek();
      const res2 = await fetch(`/api/completed-runs?since=${mondayOfWeek}`);
      if (res2.ok) {
        const runsData = await res2.json();
        setCompletedDates(runsData.dates || []);
      }
    } catch (error) {
      console.error("Error fetching completed runs:", error);
    }
  };

  const handleRegeneratePlan = async () => {
    if (!isMonday()) {
      alert("Plans can only be regenerated on Mondays");
      return;
    }

    try {
      setRegenerating(true);
      const res = await fetch("/api/generate-plan", { method: "POST" });
      const data = await res.json();
      setPlan(data.plan);
    } catch (error) {
      console.error("Error regenerating plan:", error);
      alert("Failed to regenerate plan");
    } finally {
      setRegenerating(false);
    }
  };

  function getMondayOfCurrentWeek(): string {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    return monday.toISOString().split("T")[0];
  }

  function getDateForDay(dayName: string, mondayDate: string): string {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const dayIndex = days.indexOf(dayName.toLowerCase());
    const monday = new Date(mondayDate);
    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + dayIndex);
    return targetDate.toISOString().split("T")[0];
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-[#E8521A]" />
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-zinc-500 hover:text-zinc-400"
            >
              ← Back to dashboard
            </button>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-xl text-zinc-300">No plan found for this week</p>
            <p className="mt-2 text-zinc-500">
              Generate your plan from the dashboard
            </p>
          </div>
        </div>
      </main>
    );
  }

  const weeklyPlan = plan.plan_json;
  const today = getDayOfWeek();

  return (
    <main className="min-h-screen bg-[#0A0A0A] px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-zinc-500 hover:text-zinc-400"
          >
            ← Back to dashboard
          </button>
          {isMonday() && (
            <button
              onClick={handleRegeneratePlan}
              disabled={regenerating}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white transition-colors hover:border-zinc-600 disabled:opacity-50"
            >
              {regenerating ? "Regenerating..." : "Regenerate Plan"}
            </button>
          )}
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">
            Week {weeklyPlan.week_number} - {weeklyPlan.phase}
          </h1>
          <p className="mt-2 text-zinc-400">
            {new Date(plan.week_start_date).toLocaleDateString("en-GB", {
              month: "long",
              day: "numeric",
            })}{" "}
            -{" "}
            {new Date(
              new Date(plan.week_start_date).getTime() + 6 * 24 * 60 * 60 * 1000
            ).toLocaleDateString("en-GB", {
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {weeklyPlan.coach_tip && (
          <div className="mb-8 rounded-lg border border-[#E8521A]/30 bg-[#E8521A]/10 p-6">
            <p className="text-sm font-medium text-zinc-400">Coach's Tip</p>
            <p className="mt-2 text-lg text-white">{weeklyPlan.coach_tip}</p>
          </div>
        )}

        <div className="space-y-4">
          {weeklyPlan.days.map((day) => {
            const isToday = day.day.toLowerCase() === today;
            const dayDate = getDateForDay(day.day, plan.week_start_date);
            const isCompleted = completedDates.includes(dayDate);

            return (
              <div
                key={day.day}
                className={`rounded-lg border-2 p-6 transition-all ${
                  isToday
                    ? "border-[#E8521A] bg-[#E8521A]/5"
                    : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-semibold capitalize text-white">
                        {day.day}
                      </h3>
                      {isToday && (
                        <span className="rounded-full bg-[#E8521A] px-3 py-1 text-xs font-medium text-white">
                          Today
                        </span>
                      )}
                      {isCompleted && (
                        <div className="flex items-center gap-1 rounded-full bg-green-900/30 px-3 py-1">
                          <svg
                            className="h-4 w-4 text-green-400"
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
                          <span className="text-xs font-medium text-green-400">
                            Completed
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="mt-2 text-lg font-medium text-zinc-300">
                      {day.label}
                    </p>

                    {day.type !== "rest" && (
                      <div className="mt-3 flex flex-wrap gap-4">
                        {day.distance_km && (
                          <div>
                            <p className="text-sm text-zinc-500">Distance</p>
                            <p className="text-lg font-semibold text-white">
                              {day.distance_km.toFixed(1)}km
                            </p>
                          </div>
                        )}
                        {day.target_pace_min_s && day.target_pace_max_s && (
                          <div>
                            <p className="text-sm text-zinc-500">Target Pace</p>
                            <p className="text-lg font-semibold text-white">
                              {formatPace(day.target_pace_min_s)} -{" "}
                              {formatPace(day.target_pace_max_s)}/km
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {day.focus_cue && (
                      <p className="mt-4 italic text-zinc-400">
                        {day.focus_cue}
                      </p>
                    )}

                    {day.exercises && day.exercises.length > 0 && (
                      <ul className="mt-4 space-y-1">
                        {day.exercises.map((exercise, idx) => (
                          <li key={idx} className="text-sm text-zinc-400">
                            • {exercise}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
