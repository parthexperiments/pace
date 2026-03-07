-- Initial schema for Pace app

create table public.users (
  id uuid primary key,
  strava_athlete_id bigint unique,
  name text,
  email text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  goal_distance text,
  custom_distance_km float,
  goal_type text,
  goal_pace_seconds integer,
  goal_time_seconds integer,
  deadline_type text,
  goal_date date,
  available_days text[],
  coach_tip_dismissed boolean,
  created_at timestamptz
);

create table public.weekly_plans (
  id uuid primary key,
  user_id uuid references public.users (id),
  week_start_date date,
  plan_json jsonb,
  coach_tip text,
  created_at timestamptz
);

create table public.run_analyses (
  id uuid primary key,
  user_id uuid references public.users (id),
  strava_activity_id bigint unique,
  run_date date,
  distance_m float,
  elapsed_time_s integer,
  moving_time_s integer,
  moving_pace_s integer,
  overall_pace_s integer,
  pace_gap_s integer,
  running_pct float,
  shuffling_pct float,
  stationary_pct float,
  km_splits_json jsonb,
  elevation_json jsonb,
  analysis_json jsonb,
  created_at timestamptz
);

