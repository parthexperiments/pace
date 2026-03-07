"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface RunData {
  id: string;
  run_date: string;
  distance_m: number;
  moving_pace_s: number;
  overall_pace_s: number;
  pace_gap_s: number;
  running_pct: number;
}

interface Milestone {
  date: string;
  type: string;
  description: string;
  icon: string;
}

function formatPace(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export default function ProgressPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunData[]>([]);
  const [filteredRuns, setFilteredRuns] = useState<RunData[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [timeFilter, setTimeFilter] = useState<"4w" | "8w" | "all">("8w");
  const [goalPace, setGoalPace] = useState<number | null>(null);
  const [goalDistance, setGoalDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgressData();
  }, []);

  useEffect(() => {
    filterRuns();
  }, [timeFilter, runs]);

  const fetchProgressData = async () => {
    try {
      const [runsRes, userRes] = await Promise.all([
        fetch("/api/progress/runs"),
        fetch("/api/user/status"),
      ]);

      if (!runsRes.ok || !userRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const runsData = await runsRes.json();
      const userData = await userRes.json();

      setRuns(runsData.runs || []);
      setGoalPace(userData.user?.goal_pace_seconds || null);
      
      const goalDistanceKm = 
        userData.user?.goal_distance === "5k" ? 5 :
        userData.user?.goal_distance === "10k" ? 10 :
        userData.user?.goal_distance === "half" ? 21.1 :
        userData.user?.goal_distance === "full" ? 42.2 :
        userData.user?.custom_distance_km || null;
      
      setGoalDistance(goalDistanceKm);

      detectMilestones(runsData.runs || []);
    } catch (error) {
      console.error("Error fetching progress data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterRuns = () => {
    if (timeFilter === "all") {
      setFilteredRuns(runs);
      return;
    }

    const weeks = timeFilter === "4w" ? 4 : 8;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - weeks * 7);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    setFilteredRuns(runs.filter((r) => r.run_date >= cutoffStr));
  };

  const detectMilestones = (allRuns: RunData[]) => {
    const detected: Milestone[] = [];

    const firstGoodRunning = allRuns.find((r) => r.running_pct > 0.8);
    if (firstGoodRunning) {
      detected.push({
        date: firstGoodRunning.run_date,
        type: "running_pct",
        description: `First run with 80%+ running time (${(firstGoodRunning.running_pct * 100).toFixed(0)}%)`,
        icon: "🎯",
      });
    }

    const fastestRun = [...allRuns].sort((a, b) => a.moving_pace_s - b.moving_pace_s)[0];
    if (fastestRun) {
      detected.push({
        date: fastestRun.run_date,
        type: "fastest",
        description: `Fastest moving pace: ${formatPace(fastestRun.moving_pace_s)}/km`,
        icon: "⚡",
      });
    }

    const smallestGap = [...allRuns].sort((a, b) => a.pace_gap_s - b.pace_gap_s)[0];
    if (smallestGap && smallestGap.pace_gap_s < 60) {
      detected.push({
        date: smallestGap.run_date,
        type: "gap",
        description: `Smallest pace gap: ${formatPace(smallestGap.pace_gap_s)}/km`,
        icon: "🎪",
      });
    }

    const longestRun = [...allRuns].sort((a, b) => b.distance_m - a.distance_m)[0];
    if (longestRun) {
      detected.push({
        date: longestRun.run_date,
        type: "distance",
        description: `Longest run: ${(longestRun.distance_m / 1000).toFixed(2)}km`,
        icon: "🏆",
      });
    }

    const weeklyMileage = new Map<string, number>();
    allRuns.forEach((r) => {
      const week = getMondayOfWeek(new Date(r.run_date));
      weeklyMileage.set(week, (weeklyMileage.get(week) || 0) + r.distance_m / 1000);
    });
    
    const maxWeek = [...weeklyMileage.entries()].sort((a, b) => b[1] - a[1])[0];
    if (maxWeek) {
      detected.push({
        date: maxWeek[0],
        type: "weekly",
        description: `Highest weekly mileage: ${maxWeek[1].toFixed(1)}km`,
        icon: "📈",
      });
    }

    setMilestones(detected.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const prepareRunningPctData = () => {
    return filteredRuns.map((r) => ({
      date: formatDate(r.run_date),
      pct: (r.running_pct * 100).toFixed(1),
    }));
  };

  const preparePaceGapData = () => {
    return filteredRuns.map((r) => ({
      date: formatDate(r.run_date),
      gap: r.pace_gap_s,
    }));
  };

  const prepareMovingPaceData = () => {
    return filteredRuns.map((r) => ({
      date: formatDate(r.run_date),
      pace: r.moving_pace_s,
    }));
  };

  const prepareLongRunData = () => {
    const weeklyMax = new Map<string, number>();
    filteredRuns.forEach((r) => {
      const week = getMondayOfWeek(new Date(r.run_date));
      const current = weeklyMax.get(week) || 0;
      weeklyMax.set(week, Math.max(current, r.distance_m / 1000));
    });

    return Array.from(weeklyMax.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, km]) => ({
        week: formatDate(week),
        km: km.toFixed(1),
      }));
  };

  const prepareWeeklyMileageData = () => {
    const weeklyTotal = new Map<string, number>();
    filteredRuns.forEach((r) => {
      const week = getMondayOfWeek(new Date(r.run_date));
      weeklyTotal.set(week, (weeklyTotal.get(week) || 0) + r.distance_m / 1000);
    });

    return Array.from(weeklyTotal.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, km]) => ({
        week: formatDate(week),
        km: km.toFixed(1),
      }));
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-[#E8521A]" />
      </main>
    );
  }

  if (runs.length === 0) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-8 text-sm text-zinc-500 hover:text-zinc-400"
          >
            ← Back to dashboard
          </button>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-xl text-zinc-300">No runs yet</p>
            <p className="mt-2 text-zinc-500">
              Complete your first run to see your progress!
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0A0A0A] px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mb-2 text-sm text-zinc-500 hover:text-zinc-400"
            >
              ← Back to dashboard
            </button>
            <h1 className="text-3xl font-bold text-white">Your Progress</h1>
          </div>

          <div className="flex gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => setTimeFilter("4w")}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                timeFilter === "4w"
                  ? "bg-[#E8521A] text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              4 Weeks
            </button>
            <button
              onClick={() => setTimeFilter("8w")}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                timeFilter === "8w"
                  ? "bg-[#E8521A] text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              8 Weeks
            </button>
            <button
              onClick={() => setTimeFilter("all")}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                timeFilter === "all"
                  ? "bg-[#E8521A] text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        <div className="space-y-8">
          <div className="rounded-lg border border-zinc-800 bg-[#1A1A1A] p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Time Spent Running per Run
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={prepareRunningPctData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                <XAxis dataKey="date" stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
                <YAxis
                  stroke="#71717a"
                  tick={{ fill: "#a1a1aa" }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: "0.5rem",
                  }}
                  formatter={(value: number | undefined) =>
                    value !== undefined ? [`${value}%`, "Running %"] : ["—", "Running %"]
                  }
                />
                <ReferenceLine
                  y={80}
                  stroke="#22c55e"
                  strokeDasharray="3 3"
                  label={{ value: "Target", fill: "#22c55e", position: "right" }}
                />
                <Line
                  type="monotone"
                  dataKey="pct"
                  stroke="#E8521A"
                  strokeWidth={2}
                  dot={{ fill: "#E8521A" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-[#1A1A1A] p-6">
            <h3 className="mb-2 text-lg font-semibold text-white">
              Gap Between Moving & Overall Pace
            </h3>
            <p className="mb-4 text-sm text-zinc-500">Lower is better</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={preparePaceGapData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                <XAxis dataKey="date" stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
                <YAxis
                  stroke="#71717a"
                  tick={{ fill: "#a1a1aa" }}
                  tickFormatter={(value) => formatPace(value)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: "0.5rem",
                  }}
                  formatter={(value: number | undefined) =>
                    value !== undefined ? [formatPace(value), "Gap"] : ["—", "Gap"]
                  }
                />
                <Line
                  type="monotone"
                  dataKey="gap"
                  stroke="#E8521A"
                  strokeWidth={2}
                  dot={{ fill: "#E8521A" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-[#1A1A1A] p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Moving Pace per Run
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={prepareMovingPaceData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                <XAxis dataKey="date" stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
                <YAxis
                  stroke="#71717a"
                  tick={{ fill: "#a1a1aa" }}
                  tickFormatter={(value) => formatPace(value)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: "0.5rem",
                  }}
                  formatter={(value: number | undefined) =>
                    value !== undefined ? [formatPace(value), "Pace"] : ["—", "Pace"]
                  }
                />
                {goalPace && (
                  <ReferenceLine
                    y={goalPace}
                    stroke="#a78bfa"
                    strokeDasharray="3 3"
                    label={{ value: "Goal", fill: "#a78bfa", position: "right" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="pace"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ fill: "#22c55e" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-[#1A1A1A] p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Longest Run Each Week
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={prepareLongRunData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                <XAxis dataKey="week" stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
                <YAxis stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: "0.5rem",
                  }}
                  formatter={(value: number | undefined) =>
                    value !== undefined ? [`${value}km`, "Distance"] : ["—", "Distance"]
                  }
                />
                {goalDistance && (
                  <ReferenceLine
                    y={goalDistance}
                    stroke="#a78bfa"
                    strokeDasharray="3 3"
                    label={{ value: "Goal", fill: "#a78bfa", position: "right" }}
                  />
                )}
                <Bar dataKey="km" fill="#E8521A" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-[#1A1A1A] p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Weekly Kilometres
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={prepareWeeklyMileageData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                <XAxis dataKey="week" stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
                <YAxis stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #3f3f46",
                    borderRadius: "0.5rem",
                  }}
                  formatter={(value: number | undefined) =>
                    value !== undefined ? [`${value}km`, "Total"] : ["—", "Total"]
                  }
                />
                <Bar dataKey="km" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {milestones.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-6 text-lg font-semibold text-white">
                Milestones
              </h3>
              <div className="space-y-4">
                {milestones.map((m, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 rounded-lg border border-zinc-800 bg-[#1A1A1A] p-4"
                  >
                    <div className="text-3xl">{m.icon}</div>
                    <div className="flex-1">
                      <p className="text-zinc-200">{m.description}</p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {new Date(m.date).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
