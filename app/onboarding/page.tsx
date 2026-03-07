"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Step1Distance from "./components/Step1Distance";
import Step2Goal from "./components/Step2Goal";
import Step3Deadline from "./components/Step3Deadline";
import Step4Availability from "./components/Step4Availability";
import DeadlineWarning from "./components/DeadlineWarning";

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

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(true);
  const [syncProgress, setSyncProgress] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [data, setData] = useState<OnboardingData>({
    goal_distance: null,
    custom_distance_km: null,
    goal_type: null,
    goal_time_seconds: null,
    goal_pace_seconds: null,
    deadline_type: null,
    goal_date: null,
    available_days: [],
  });

  useEffect(() => {
    checkAndSyncHistory();
  }, []);

  const checkAndSyncHistory = async () => {
    try {
      const userRes = await fetch("/api/user/status");
      if (!userRes.ok) {
        setIsSyncingHistory(false);
        return;
      }

      const userData = await userRes.json();
      
      if (!userData.user?.needs_historical_sync) {
        setIsSyncingHistory(false);
        return;
      }

      const interval = setInterval(() => {
        setSyncProgress((prev) => Math.min(prev + 2, 95));
      }, 200);

      const syncRes = await fetch("/api/sync-historical-runs", {
        method: "POST",
      });

      clearInterval(interval);
      setSyncProgress(100);

      if (syncRes.ok) {
        await fetch("/api/user/update-sync-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ needs_historical_sync: false }),
        });
      }

      setTimeout(() => {
        setIsSyncingHistory(false);
      }, 500);
    } catch (error) {
      console.error("Error syncing history:", error);
      setIsSyncingHistory(false);
    }
  };

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = async () => {
    try {
      setIsSubmitting(true);
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error("Failed to save onboarding data");
      }

      const result = await res.json();

      const shouldCheckWarning =
        data.deadline_type === "user_set" ||
        data.deadline_type === "ai_recommended";

      if (shouldCheckWarning) {
        const warningCheck = await fetch("/api/check-deadline-warning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goal_distance: data.goal_distance,
            custom_distance_km: data.custom_distance_km,
            goal_date: result.user.goal_date,
          }),
        });

        if (warningCheck.ok) {
          const warningResult = await warningCheck.json();
          if (warningResult.showWarning) {
            setWarningMessage(warningResult.message);
            setShowWarning(true);
            setIsSubmitting(false);
            return;
          }
        }
      }

      router.push("/dashboard");
    } catch (error) {
      console.error("Onboarding error:", error);
      alert("Failed to save your settings. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptWarning = () => {
    router.push("/dashboard");
  };

  const handleChangeDate = () => {
    setShowWarning(false);
    setCurrentStep(3);
  };

  const progress = (currentStep / 4) * 100;

  if (showWarning) {
    return (
      <DeadlineWarning
        warning={warningMessage}
        onAccept={handleAcceptWarning}
        onChangeDate={handleChangeDate}
      />
    );
  }

  if (isSyncingHistory) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="w-full max-w-md px-6 text-center">
          <div className="mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E8521A]/10">
              <svg
                className="h-8 w-8 animate-spin text-[#E8521A]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">
              Analyzing your run history
            </h1>
            <p className="text-sm text-zinc-400">
              We're looking at your past runs to personalize your coaching — takes about a minute
            </p>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-[#E8521A] transition-all duration-300 ease-out"
              style={{ width: `${syncProgress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">{syncProgress}%</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#0A0A0A]">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-zinc-500">Step {currentStep} of 4</p>
            <p className="text-sm text-zinc-500">{Math.round(progress)}%</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-[#E8521A] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="min-h-[400px]">
          {currentStep === 1 && (
            <Step1Distance
              data={data}
              updateData={updateData}
              onNext={handleNext}
            />
          )}
          {currentStep === 2 && (
            <Step2Goal
              data={data}
              updateData={updateData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 3 && (
            <Step3Deadline
              data={data}
              updateData={updateData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 4 && (
            <Step4Availability
              data={data}
              updateData={updateData}
              onComplete={handleComplete}
              onBack={handleBack}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </main>
  );
}
