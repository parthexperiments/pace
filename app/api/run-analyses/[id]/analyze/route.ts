import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { RunAnalysis, User } from "@/lib/types";
import { generateRunCoachingAnalysis } from "@/lib/claude";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (userError) {
    console.error("Error fetching user from Supabase", userError);
    return NextResponse.json(
      { error: "Failed to load user" },
      { status: 500 }
    );
  }

  if (!userRow) {
    return NextResponse.json(
      { error: "User not found in Supabase" },
      { status: 404 }
    );
  }

  const userId = userRow.id as string;

  const { data: runRow, error: runError } = await supabaseAdmin
    .from("run_analyses")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (runError) {
    console.error("Error fetching run_analyses row", runError);
    return NextResponse.json(
      { error: "Failed to load run" },
      { status: 500 }
    );
  }

  if (!runRow) {
    return NextResponse.json(
      { error: "Run not found" },
      { status: 404 }
    );
  }

  if (runRow.analysis_json && Object.keys(runRow.analysis_json).length > 0) {
    return NextResponse.json({
      analysis: runRow.analysis_json,
      cached: true,
    });
  }

  const { data: previousRunRow } = await supabaseAdmin
    .from("run_analyses")
    .select("moving_pace_s, overall_pace_s, run_date")
    .eq("user_id", userId)
    .lt("run_date", runRow.run_date)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const run = runRow as RunAnalysis;
  const user = userRow as User;

  const previousRun = previousRunRow
    ? {
        moving_pace_s: previousRunRow.moving_pace_s,
        overall_pace_s: previousRunRow.overall_pace_s,
      }
    : null;

  let analysis;
  try {
    analysis = await generateRunCoachingAnalysis({
      run,
      previousRun,
      user,
    });
  } catch (err) {
    console.error("Error generating Claude analysis", err);
    return NextResponse.json(
      { error: "Failed to generate analysis" },
      { status: 502 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("run_analyses")
    .update({
      analysis_json: analysis,
    })
    .eq("id", params.id)
    .eq("user_id", userId);

  if (updateError) {
    console.error("Failed to persist analysis_json", updateError);
  }

  return NextResponse.json({
    analysis,
    cached: false,
  });
}

