import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: runs, error } = await supabaseAdmin
      .from("run_analyses")
      .select("id, run_date, distance_m, moving_pace_s, overall_pace_s, pace_gap_s, running_pct")
      .eq("user_id", session.user.id)
      .order("run_date", { ascending: true });

    if (error) {
      console.error("Failed to fetch runs:", error);
      return NextResponse.json(
        { error: "Failed to fetch runs" },
        { status: 500 }
      );
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (error) {
    console.error("Error in /api/progress/runs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
