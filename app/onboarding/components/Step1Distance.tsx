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
}

const distances = [
  { id: "5k", label: "5K", description: "5 kilometers" },
  { id: "10k", label: "10K", description: "10 kilometers" },
  { id: "half", label: "Half Marathon", description: "21.1 km" },
  { id: "full", label: "Full Marathon", description: "42.2 km" },
  { id: "custom", label: "Custom Distance", description: "Set your own" },
];

export default function Step1Distance({ data, updateData, onNext }: Props) {
  const [customKm, setCustomKm] = useState(data.custom_distance_km || "");

  const handleSelect = (distanceId: string) => {
    updateData({
      goal_distance: distanceId,
      custom_distance_km: distanceId === "custom" ? Number(customKm) || null : null,
    });
  };

  const handleCustomKmChange = (value: string) => {
    setCustomKm(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      updateData({
        goal_distance: "custom",
        custom_distance_km: num,
      });
    }
  };

  const canContinue =
    data.goal_distance &&
    (data.goal_distance !== "custom" || (data.custom_distance_km && data.custom_distance_km > 0));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">What are you training for?</h1>
        <p className="text-zinc-400">Choose the distance you want to conquer</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {distances.map((distance) => (
          <div key={distance.id}>
            <button
              type="button"
              onClick={() => handleSelect(distance.id)}
              className={`w-full rounded-lg border-2 p-6 text-left transition-all ${
                data.goal_distance === distance.id
                  ? "border-[#E8521A] bg-[#E8521A]/10"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              <div className="text-xl font-semibold text-white">{distance.label}</div>
              <div className="mt-1 text-sm text-zinc-400">{distance.description}</div>
            </button>

            {distance.id === "custom" && data.goal_distance === "custom" && (
              <div className="mt-3 px-2">
                <label className="block text-sm text-zinc-400">Distance (km)</label>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={customKm}
                  onChange={(e) => handleCustomKmChange(e.target.value)}
                  placeholder="e.g. 15"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500 focus:border-[#E8521A] focus:outline-none"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!canContinue}
        className="w-full rounded-lg bg-[#E8521A] px-6 py-3 font-medium text-white transition-colors hover:bg-[#d14715] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#E8521A]"
      >
        Continue
      </button>
    </div>
  );
}
