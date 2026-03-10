# Pace — AI Running Coach

## What This App Does
Pace is an AI running coach that connects to Strava and automatically analyses every run. It tells the user what actually happened (not what Strava shows), what to do next, and shows improvement over time. Every user must have a specific distance goal — no fitness-only goals.

## Stack
- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL)
- NextAuth for Strava OAuth
- Anthropic Claude API (claude-sonnet-4-20250514)
- Strava API v3
- Recharts for charts
- Vercel for deployment

## Core Principle — Never Send Raw Strava Data to Claude
Raw Strava streams have thousands of data points. Always preprocess first.
Preprocessing pipeline output (~700 tokens):
- overall_pace_s: total elapsed time / distance (PRIMARY METRIC)
- moving_pace_s: pace when speed above 2 km/h (secondary diagnostic)
- moving_time_s, elapsed_time_s, distance_km
- speed_distribution: { running_pct, walking_pct, stopped_pct }
- km_splits: [{km, pace_s}] — one entry per km
- elevation: { gain_m, loss_m, flat }
- previous_run_summary: most recent run of same run_type

## Speed Distribution
User-facing labels:
- **Running %** — time spent running (speed > 2 km/h)
- **Walking %** — time spent at slow pace (0.5-2 km/h)
- **Stopped %** — time spent stationary (< 0.5 km/h)

Display logic:
- Always show overall_pace_s as primary metric
- Only show moving_pace_s when stopped_pct > 0.10
- Never mention stopping if stopped_pct < 0.10

## Run Type Classification
Classification is deterministic — NOT AI generated.
Types: long, tempo, easy, short, race_effort, strength

### If goal_type === 'finish':
Classify by distance only:
- **long**: >= 70% of goal distance AND >= 8km
- **easy**: >= 30% of goal distance AND >= 4km
- **short**: < 25% of goal distance OR < 5km

### If goal_type === 'time' or 'pace':
Classify by distance + pace:
- **long**: >= 70% of goal distance AND >= 8km
- **tempo**: pace within 45s of goal + distance >= 30% of goal
- **easy**: pace > goal + 45s + distance >= 30% of goal
- **race_effort**: pace < goal - 20s + distance >= 3km
- **short**: < 25% of goal distance OR < 5km

## Progressive Analysis
Before calling Claude for post-run analysis:
1. Fetch most recent `run_summary_json` of same `run_type`
2. Pass as context to Claude
3. Claude assesses if previous recommendation was followed
4. Claude builds on previous insights — never starts from scratch

## run_summary_json Structure
Stored in `run_analyses.run_summary_json`:
```json
{
  "run_type": "long | tempo | easy | short | race_effort",
  "date": "YYYY-MM-DD",
  "distance_km": 10.5,
  "overall_pace_s": 360,
  "running_pct": 0.92,
  "walking_pct": 0.05,
  "stopped_pct": 0.03,
  "insights": ["insight 1", "insight 2", "..."],
  "recommendation": "specific action for next run",
  "recommendation_followed": true | false | null
}
```
Note: `insights` array has NO cap — include all meaningful observations.

## Claude API Rules
- Model: claude-sonnet-4-20250514
- Always return JSON only — no prose outside JSON
- One Claude call per trigger — never multiple calls for same feature
- Cache all results in DB — never regenerate on page load
- Max 80 words per coaching paragraph
- Never assume why a runner's pace changed — find patterns from data only
- Open analytical approach — Claude finds what matters, not a fixed checklist
- Always reference specific numbers, never generic advice
- Never mention stopping if stopped_pct < 0.10

## Database Schema

### users table
- id: uuid primary key DEFAULT gen_random_uuid()
- strava_athlete_id: bigint unique
- name, email: text
- access_token, refresh_token: text
- token_expires_at: timestamptz
- goal_distance: text (5k | 10k | half | full | custom)
- custom_distance_km: float
- goal_type: text (finish | time | pace)
- goal_pace_seconds: integer (per km)
- goal_time_seconds: integer
- deadline_type: text (user_set | ai_recommended | none)
- goal_date: date (null if deadline_type = none)
- available_days: text[]
- coach_tip_dismissed: boolean
- needs_historical_sync: boolean DEFAULT true
- created_at: timestamptz DEFAULT now()

### weekly_plans table
- id: uuid primary key DEFAULT gen_random_uuid()
- user_id: uuid references users
- week_start_date: date
- plan_json: jsonb
- coach_tip: text
- created_at: timestamptz DEFAULT now()

### run_analyses table
- id: uuid primary key DEFAULT gen_random_uuid()
- user_id: uuid references users
- strava_activity_id: bigint unique
- run_date: date
- run_type: text (long | tempo | easy | short | race_effort)
- distance_m: float
- elapsed_time_s, moving_time_s: integer
- moving_pace_s, overall_pace_s: integer
- pace_gap_s: integer
- running_pct, walking_pct, stopped_pct: float
- km_splits_json: jsonb
- elevation_json: jsonb
- analysis_json: jsonb
- run_summary_json: jsonb
- created_at: timestamptz DEFAULT now()

## Goal Setup — 4 Steps
1. Distance: 5k | 10k | half | full | custom
2. Goal: finish | time (HH:MM) | pace (MM:SS per km)
3. Deadline: user_set (date picker) | ai_recommended (no picker, recommend on insight screen) | none (rolling 12-week plan)
4. Available days: multi-select toggles

## Home Dashboard — 4 States
1. Rest day: mobility routine + last run snapshot + weekly progress + countdown
2. Run day pre-run: today's brief card prominent + weekly progress + countdown
3. Run day post-run not synced: nudge to sync Strava
4. Run day post-run synced: analysis ready card + updated score

## Scoring
- Users with deadline_type user_set or ai_recommended: Readiness Score (0-100)
  - Long run readiness 30%, pace readiness 25%, consistency 25%, running_pct trend 10%, runway 10%
- Users with deadline_type none: Consistency Score (0-100)
  - Run frequency 40%, streak 30%, pace trend 20%, running_pct trend 10%

## Post-Run Analysis — 6 Sections
1. Honest Numbers: overall pace (primary), moving pace (only if stopped_pct > 0.10), speed distribution
2. Key Insight: Claude finds what matters most — not prescribed
3. Km-by-Km: bar chart, colour coded vs goal pace
4. Performance vs Plan: did they hit today's target
5. The One Thing: one actionable sentence for next run
6. AI Coach Debrief: 3-4 paragraphs, max 80 words each

## Pre-Run Brief Content
- Run type and distance
- Target overall pace (range, not exact)
- One focus cue — pattern-based from last 3 runs, never generic
- Pacing strategy — open framing, no assumed causes
- 5 dynamic warm-up stretches specific to run type

## Weekly Plan — 4 Phases
- Base (weeks 1-3): volume, intentionally slow
- Build (weeks 4-6): tempo, approaching goal pace
- Peak (week 7): longest run, max volume
- Taper (week 8): cut volume 30-40%, maintain frequency

## Strength Sessions
Always include 4-5 specific exercises in plan.
Scale intensity to training phase:
- **Base**: 2 sets per exercise
- **Build**: 3 sets per exercise
- **Peak**: 2 sets maintenance
- **Taper**: 1 set activation

## Token Optimisation
- Cache weekly plan: generated Monday, valid until next Monday
- Cache pre-run brief: generated once per run day morning
- Cache post-run analysis: generated once on sync, stored permanently
- Minify all JSON before sending to Claude
- Never re-generate cached content

## Build Order (follow this exactly)
1. Supabase setup + DB schema
2. Strava OAuth with NextAuth + token storage
3. Strava data pipeline + preprocessing functions
4. Post-run analysis (core feature)
5. Home dashboard state machine
6. Weekly plan generation
7. Pre-run brief
8. Progress tracker + charts
9. Readiness/Consistency score
10. Rest day routines + shareable card + polish

## Environment Variables Needed
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=