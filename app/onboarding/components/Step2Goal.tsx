"use client";

import { useState } from "react";

interface OnboardingData {
  goal_distance: string | null;
  custom_distance_km: number | null;
  goal_type: string | null;
  goal_time_seconds: number | null;
  goal_pace_seconds: number | null;
  deadline_type: string | null;
  goal_date: string | null;
  available_days: string[];
}

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const goalTypes = [
  { id: "finish", label: "Just Finish", description: "Complete the distance" },
  { id: "time", label: "Finish Under a Time", description: "Beat the clock" },
  { id: "pace", label: "Hit a Target Pace", description: "Run at your goal pace" },
];

export default function Step2Goal({ data, updateData, onNext, onBack }: Props) {
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [paceMinutes, setPaceMinutes] = useState("");
  const [paceSeconds, setPaceSeconds] = useState("");

  const handleSelectGoalType = (goalType: string) => {
    updateData({
      goal_type: goalType,
      goal_time_seconds: goalType === "time" ? data.goal_time_seconds : null,
      goal_pace_seconds: goalType === "pace" ? data.goal_pace_seconds : null,
    });
  };

  const handleTimeChange = (h: string, m: string) => {
    setHours(h);
    setMinutes(m);
    const totalSeconds = (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60;
    if (totalSeconds > 0) {
      updateData({
        goal_type: "time",
        goal_time_seconds: totalSeconds,
      });
    }
  };

  const handlePaceChange = (m: string, s: string) => {
    setPaceMinutes(m);
    setPaceSeconds(s);
    const totalSeconds = (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
    if (totalSeconds > 0) {
      updateData({
        goal_type: "pace",
        goal_pace_seconds: totalSeconds,
      });
    }
  };

  const canContinue =
    data.goal_type === "finish" ||
    (data.goal_type === "time" && data.goal_time_seconds && data.goal_time_seconds > 0) ||
    (data.goal_type === "pace" && data.goal_pace_seconds && data.goal_pace_seconds > 0);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">What's your goal?</h1>
        <p className="text-zinc-400">Define what success looks like for you</p>
      </div>

      <div className="space-y-4">
        {goalTypes.map((goalType) => (
          <div key={goalType.id}>
            <button
              type="button"
              onClick={() => handleSelectGoalType(goalType.id)}
              className={`w-full rounded-lg border-2 p-6 text-left transition-all ${
                data.goal_type === goalType.id
                  ? "border-[#E8521A] bg-[#E8521A]/10"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              <div className="text-xl font-semibold text-white">{goalType.label}</div>
              <div className="mt-1 text-sm text-zinc-400">{goalType.description}</div>
            </button>

            {goalType.id === "time" && data.goal_type === "time" && (
              <div className="mt-3 px-2">
                <label className="block text-sm text-zinc-400">Target Time</label>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={hours}
                      onChange={(e) => handleTimeChange(e.target.value, minutes)}
                      placeholder="HH"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-center text-white placeholder-zinc-500 focus:border-[#E8521A] focus:outline-none"
                    />
                    <p className="mt-1 text-center text-xs text-zinc-500">hours</p>
                  </div>
                  <span className="text-2xl text-zinc-600">:</span>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={minutes}
                      onChange={(e) => handleTimeChange(hours, e.target.value)}
                      placeholder="MM"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-center text-white placeholder-zinc-500 focus:border-[#E8521A] focus:outline-none"
                    />
                    <p className="mt-1 text-center text-xs text-zinc-500">minutes</p>
                  </div>
                </div>
              </div>
            )}

            {goalType.id === "pace" && data.goal_type === "pace" && (
              <div className="mt-3 px-2">
                <label className="block text-sm text-zinc-400">Target Pace (per km)</label>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={paceMinutes}
                      onChange={(e) => handlePaceChange(e.target.value, paceSeconds)}
                      placeholder="MM"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-center text-white placeholder-zinc-500 focus:border-[#E8521A] focus:outline-none"
                    />
                    <p className="mt-1 text-center text-xs text-zinc-500">minutes</p>
                  </div>
                  <span className="text-2xl text-zinc-600">:</span>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={paceSeconds}
                      onChange={(e) => handlePaceChange(paceMinutes, e.target.value)}
                      placeholder="SS"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-center text-white placeholder-zinc-500 focus:border-[#E8521A] focus:outline-none"
                    />
                    <p className="mt-1 text-center text-xs text-zinc-500">seconds</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:border-zinc-600"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="flex-1 rounded-lg bg-[#E8521A] px-6 py-3 font-medium text-white transition-colors hover:bg-[#d14715] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#E8521A]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
