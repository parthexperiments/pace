import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({
        authenticated: false,
        onboardingComplete: false,
        needsHistoricalSync: false,
        goalDistance: null,
        goalDate: null,
        name: null,
      });
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("goal_distance, goal_date, needs_historical_sync, name")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch user status:", error);
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({
        authenticated: true,
        onboardingComplete: false,
        needsHistoricalSync: true,
        goalDistance: null,
        goalDate: null,
        name: session.user.name ?? null,
      });
    }

    const onboardingComplete = user.goal_distance != null && user.goal_distance !== "";

    return NextResponse.json({
      authenticated: true,
      onboardingComplete,
      needsHistoricalSync: user.needs_historical_sync === true,
      goalDistance: user.goal_distance ?? null,
      goalDate: user.goal_date ?? null,
      name: user.name ?? null,
    });
  } catch (error) {
    console.error("Error in /api/user/status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
