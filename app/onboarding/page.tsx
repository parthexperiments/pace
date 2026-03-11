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
    // Fire-and-forget: start historical sync in background; do not block onboarding
    fetch("/api/sync-historical-runs", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch("/api/user/status");
        if (!res.ok) return;
        const data = await res.json();
        if (data.authenticated && data.onboardingComplete) {
          router.push("/dashboard");
        }
      } catch {
        // ignore
      }
    };
    checkStatus();
  }, [router]);

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
