"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckForRun = async () => {
    try {
      setChecking(true);
      setError(null);

      const res = await fetch("/api/check-new-run", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to check for new run");
      }

      const result = await res.json();

      if (result.found && result.activityId) {
        router.push(`/analysis/${result.activityId}`);
      } else {
        setError(
          "No new run found yet. Make sure your run is uploaded to Strava and try again."
        );
      }
    } catch (err) {
      console.error("Error checking for run:", err);
      setError("Failed to check for new runs. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A0A0A] px-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#E8521A]/10">
            <svg
              className="h-10 w-10 text-[#E8521A]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-white">Nice work!</h1>
          <p className="text-lg text-zinc-400">
            Sync your Strava to get your post-run analysis
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-left">
          <h2 className="text-lg font-semibold text-white">How to sync:</h2>
          <ol className="mt-4 space-y-3 text-zinc-300">
            <li className="flex items-start">
              <span className="mr-3 font-bold text-[#E8521A]">1.</span>
              <span>Open the Strava app on your phone</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-[#E8521A]">2.</span>
              <span>Tap the sync icon (circular arrows) in the top right</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-[#E8521A]">3.</span>
              <span>Wait a few seconds for your run to upload</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-[#E8521A]">4.</span>
              <span>Come back here and click the button below</span>
            </li>
          </ol>
        </div>

        {error && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleCheckForRun}
          disabled={checking}
          className="w-full rounded-lg bg-[#E8521A] px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-[#d14715] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? (
            <span className="flex items-center justify-center">
              <svg
                className="mr-2 h-5 w-5 animate-spin"
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
              Checking...
            </span>
          ) : (
            "Check for new run"
          )}
        </button>

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-zinc-500 hover:text-zinc-400"
        >
          Back to dashboard
        </button>
      </div>
    </main>
  );
}
