export interface User {
  id: string;
  strava_athlete_id: number;
  name: string | null;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  goal_distance: string | null;
  custom_distance_km: number | null;
  goal_type: string | null;
  goal_pace_seconds: number | null;
  goal_time_seconds: number | null;
  deadline_type: string | null;
  goal_date: string | null;
  available_days: string[] | null;
  coach_tip_dismissed: boolean | null;
  created_at: string | null;
}

export interface WeeklyPlan {
  id: string;
  user_id: string;
  week_start_date: string | null;
  plan_json: unknown;
  coach_tip: string | null;
  created_at: string | null;
}

export interface RunAnalysis {
  id: string;
  user_id: string;
  strava_activity_id: number;
  run_date: string | null;
  distance_m: number | null;
  elapsed_time_s: number | null;
  moving_time_s: number | null;
  moving_pace_s: number | null;
  overall_pace_s: number | null;
  pace_gap_s: number | null;
  running_pct: number | null;
  shuffling_pct: number | null;
  stationary_pct: number | null;
  km_splits_json: unknown;
  elevation_json: unknown;
  analysis_json: unknown;
  created_at: string | null;
}

