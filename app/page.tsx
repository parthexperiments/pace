"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (status !== "authenticated" || checkingOnboarding) return;
      setCheckingOnboarding(true);
      try {
        const res = await fetch("/api/user/status");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.authenticated) return;
        if (data.onboardingComplete) {
          router.push("/dashboard");
        } else {
          router.push("/onboarding");
        }
      } catch (error) {
        console.error("Failed to check user status:", error);
      } finally {
        setCheckingOnboarding(false);
      }
    };

    if (status === "authenticated") {
      checkStatus();
    }
  }, [status, router, checkingOnboarding]);

  if (status === "loading" || (status === "authenticated" && checkingOnboarding)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-700" />
      </main>
    );
  }

  if (session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-700" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        Your personal AI running coach
      </h1>
      <p className="mt-4 max-w-sm text-center text-lg text-zinc-400">
        Connect Strava. Know exactly what to do every run.
      </p>
      <button
        type="button"
        onClick={() => signIn("strava")}
        className="mt-10 rounded-lg bg-orange-500 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-orange-600"
      >
        Connect with Strava
      </button>
    </main>
  );
}
