import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");

    if (!since) {
      return NextResponse.json(
        { error: "since parameter required" },
        { status: 400 }
      );
    }

    const { data: runs, error } = await supabaseAdmin
      .from("run_analyses")
      .select("run_date")
      .eq("user_id", session.user.id)
      .gte("run_date", since)
      .order("run_date", { ascending: true });

    if (error) {
      console.error("Failed to fetch completed runs:", error);
      return NextResponse.json(
        { error: "Failed to fetch completed runs" },
        { status: 500 }
      );
    }

    const dates = runs?.map((r) => r.run_date) || [];
    return NextResponse.json({ dates });
  } catch (error) {
    console.error("Error in /api/completed-runs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
