"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RunAnalysis } from "@/lib/types";

interface KmSplit {
  km: number;
  pace_s: number;
}

interface Elevation {
  gain_m: number;
  loss_m: number;
  flat: boolean;
}

interface AnalysisJson {
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

interface AnalysisResponse {
  analysis: RunAnalysis;
  cached: boolean;
  user_goal_pace_seconds?: number | null;
}

function formatPace(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)}km`;
}

export default function AnalysisPage() {
  const params = useParams();
  const activityId = params?.activityId;
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activityId) return;

    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/analyse-run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activityId: parseInt(activityId as string, 10),
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to fetch analysis");
        }

        const result = await res.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [activityId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-orange-500" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-400">
          <p className="text-sm font-medium">Error</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
        <p className="text-zinc-500">No analysis data available</p>
      </main>
    );
  }

  const analysis = data.analysis;
  const analysisJson = analysis.analysis_json as AnalysisJson;
  const kmSplits = (analysis.km_splits_json as KmSplit[]) || [];
  const elevation = (analysis.elevation_json as Elevation) || {
    gain_m: 0,
    loss_m: 0,
    flat: true,
  };

  const goalPaceSeconds = data.user_goal_pace_seconds || 360;

  const chartData = kmSplits.map((split) => {
    const diff = split.pace_s - goalPaceSeconds;
    let color = "#22c55e";
    if (diff > 60) color = "#ef4444";
    else if (diff > 30) color = "#f59e0b";

    return {
      km: split.km,
      pace_s: split.pace_s,
      pace_display: formatPace(split.pace_s),
      fill: color,
    };
  });

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Post-Run Analysis
          </h1>
          <p className="text-sm text-zinc-500">
            {new Date(analysis.run_date || "").toLocaleDateString("en-GB", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#E8521A]">
            1. Honest Numbers
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-500">Moving Pace</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {formatPace(analysis.moving_pace_s || 0)}/km
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-500">Overall Pace</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {formatPace(analysis.overall_pace_s || 0)}/km
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-500">Distance</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {formatDistance(analysis.distance_m || 0)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-500">Pace Gap</p>
              <p className="mt-1 text-2xl font-bold text-white">
                +{formatPace(analysis.pace_gap_s || 0)}/km
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-3 text-sm font-medium text-zinc-400">
              Speed Distribution
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-zinc-500">Running</p>
                <p className="mt-1 text-lg font-semibold text-green-400">
                  {formatPercentage(analysis.running_pct || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Shuffling</p>
                <p className="mt-1 text-lg font-semibold text-amber-400">
                  {formatPercentage(analysis.shuffling_pct || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Stationary</p>
                <p className="mt-1 text-lg font-semibold text-red-400">
                  {formatPercentage(analysis.stationary_pct || 0)}
                </p>
              </div>
            </div>
          </div>
          {analysisJson?.honest_numbers?.summary && (
            <p className="text-zinc-300 leading-relaxed">
              {analysisJson.honest_numbers.summary}
            </p>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#E8521A]">
            2. Key Insight
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/50 p-6">
            <p className="text-lg text-zinc-100 leading-relaxed">
              {analysisJson?.key_insight?.summary ||
                "No key insight available"}
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#E8521A]">3. Km-by-Km</h2>
          {kmSplits.length > 0 ? (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="km"
                      stroke="#71717a"
                      tick={{ fill: "#a1a1aa" }}
                    />
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
                        color: "#fff",
                      }}
                      labelStyle={{ color: "#a1a1aa" }}
                      formatter={(value: number) => [
                        formatPace(value),
                        "Pace",
                      ]}
                    />
                    <Bar dataKey="pace_s" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-green-500" />
                  <span>Within 30s of goal</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-amber-500" />
                  <span>30-60s over</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-red-500" />
                  <span>60s+ over</span>
                </div>
              </div>
              {analysisJson?.km_by_km?.summary && (
                <p className="text-zinc-300 leading-relaxed">
                  {analysisJson.km_by_km.summary}
                </p>
              )}
            </>
          ) : (
            <p className="text-zinc-500">No km splits available</p>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#E8521A]">
            4. Performance vs Plan
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-zinc-300 leading-relaxed">
              {analysisJson?.performance_vs_plan?.summary ||
                "No performance data available"}
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#E8521A]">
            5. The One Thing
          </h2>
          <div className="rounded-lg border-2 border-[#E8521A]/30 bg-gradient-to-br from-orange-950/30 to-zinc-900 p-8">
            <p className="text-2xl font-medium text-white leading-relaxed">
              {analysisJson?.the_one_thing?.cue ||
                "Focus on maintaining consistent effort"}
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#E8521A]">
            6. AI Coach Debrief
          </h2>
          <div className="space-y-4">
            {analysisJson?.coach_debrief?.paragraphs?.map(
              (paragraph, index) => (
                <p
                  key={index}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-300 leading-relaxed"
                >
                  {paragraph}
                </p>
              )
            ) || (
              <p className="text-zinc-500">No coaching debrief available</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
