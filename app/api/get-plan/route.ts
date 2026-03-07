import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";

function getMondayOfCurrentWeek(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  return monday.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mondayOfWeek = getMondayOfCurrentWeek();

    const { data: plan, error } = await supabaseAdmin
      .from("weekly_plans")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("week_start_date", mondayOfWeek)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch plan:", error);
      return NextResponse.json(
        { error: "Failed to fetch plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({ plan: plan || null });
  } catch (error) {
    console.error("Error in /api/get-plan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
