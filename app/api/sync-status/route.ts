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

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("needs_historical_sync")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch sync status:", error);
      return NextResponse.json(
        { error: "Failed to fetch sync status" },
        { status: 500 }
      );
    }

    const syncing = user?.needs_historical_sync === true;

    const { count, error: countError } = await supabaseAdmin
      .from("run_analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user.id);

    if (countError) {
      return NextResponse.json({
        syncing,
        processed: 0,
      });
    }

    return NextResponse.json({
      syncing,
      processed: count ?? 0,
    });
  } catch (error) {
    console.error("Error in /api/sync-status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
