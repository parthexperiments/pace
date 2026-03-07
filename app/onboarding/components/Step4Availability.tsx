"use client";

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
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const days = [
  { id: "Monday", label: "Mon" },
  { id: "Tuesday", label: "Tue" },
  { id: "Wednesday", label: "Wed" },
  { id: "Thursday", label: "Thu" },
  { id: "Friday", label: "Fri" },
  { id: "Saturday", label: "Sat" },
  { id: "Sunday", label: "Sun" },
];

export default function Step4Availability({
  data,
  updateData,
  onComplete,
  onBack,
  isSubmitting,
}: Props) {
  const toggleDay = (dayId: string) => {
    const currentDays = data.available_days || [];
    const newDays = currentDays.includes(dayId)
      ? currentDays.filter((d) => d !== dayId)
      : [...currentDays, dayId];
    
    updateData({ available_days: newDays });
  };

  const selectedCount = data.available_days.length;
  const canContinue = selectedCount > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Which days can you run?</h1>
        <p className="text-zinc-400">Select all days you're available to train</p>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const isSelected = data.available_days.includes(day.id);
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => toggleDay(day.id)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border-2 p-3 transition-all ${
                isSelected
                  ? "border-[#E8521A] bg-[#E8521A]/10"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              <span className="text-sm font-medium text-white">{day.label}</span>
            </button>
          );
        })}
      </div>

      {selectedCount > 0 && selectedCount < 3 && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-400">
            We recommend at least 3 days for effective training
          </p>
        </div>
      )}

      {selectedCount >= 3 && (
        <div className="rounded-lg border border-green-900/50 bg-green-950/20 p-4">
          <p className="text-sm text-green-400">
            Great! {selectedCount} days per week is a solid training schedule
          </p>
        </div>
      )}

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:border-zinc-600 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={!canContinue || isSubmitting}
          className="flex-1 rounded-lg bg-[#E8521A] px-6 py-3 font-medium text-white transition-colors hover:bg-[#d14715] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#E8521A]"
        >
          {isSubmitting ? "Saving..." : "Complete Setup"}
        </button>
      </div>
    </div>
  );
}
