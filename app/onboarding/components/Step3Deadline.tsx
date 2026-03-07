"use client";

import { useState, useEffect } from "react";

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

const deadlineOptions = [
  { id: "user_set", label: "I have a date in mind", description: "Training for a specific event" },
  { id: "ai_recommended", label: "Not sure yet — help me decide", description: "Get AI recommendation" },
  { id: "none", label: "No deadline — just building consistency", description: "Rolling 12-week plan" },
];

export default function Step3Deadline({ data, updateData, onNext, onBack }: Props) {
  const [selectedDate, setSelectedDate] = useState(data.goal_date || "");
  const [contextMessage, setContextMessage] = useState("");

  useEffect(() => {
    if (selectedDate && data.deadline_type === "user_set") {
      const today = new Date();
      const goalDate = new Date(selectedDate);
      const diffTime = goalDate.getTime() - today.getTime();
      const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));

      if (diffWeeks < 4) {
        setContextMessage("That's tight — we'll build a focused plan");
      } else if (diffWeeks <= 8) {
        setContextMessage("That's a solid runway");
      } else {
        setContextMessage("Great — plenty of time to build properly");
      }
    } else {
      setContextMessage("");
    }
  }, [selectedDate, data.deadline_type]);

  const handleSelectDeadlineType = (deadlineType: string) => {
    updateData({
      deadline_type: deadlineType,
      goal_date: deadlineType === "user_set" ? selectedDate || null : null,
    });
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    updateData({
      deadline_type: "user_set",
      goal_date: date,
    });
  };

  const canContinue =
    (data.deadline_type === "user_set" && data.goal_date) ||
    data.deadline_type === "ai_recommended" ||
    data.deadline_type === "none";

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">By when do you want to achieve this?</h1>
        <p className="text-zinc-400">Set your timeline or let us guide you</p>
      </div>

      <div className="space-y-4">
        {deadlineOptions.map((option) => (
          <div key={option.id}>
            <button
              type="button"
              onClick={() => handleSelectDeadlineType(option.id)}
              className={`w-full rounded-lg border-2 p-6 text-left transition-all ${
                data.deadline_type === option.id
                  ? "border-[#E8521A] bg-[#E8521A]/10"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              <div className="text-xl font-semibold text-white">{option.label}</div>
              <div className="mt-1 text-sm text-zinc-400">{option.description}</div>
            </button>

            {option.id === "user_set" && data.deadline_type === "user_set" && (
              <div className="mt-3 px-2">
                <label className="block text-sm text-zinc-400">Goal Date</label>
                <input
                  type="date"
                  min={today}
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-white focus:border-[#E8521A] focus:outline-none"
                />
                {contextMessage && (
                  <p className="mt-2 text-sm text-[#E8521A]">{contextMessage}</p>
                )}
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
