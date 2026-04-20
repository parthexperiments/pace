# Pace - AI Running Coach

I built Pace to help me train for my first half marathon with better feedback than standard running apps.

Instead of only showing distance and average pace, Pace connects to Strava, breaks each run down into meaningful signals, and gives me practical coaching for what to do in my next run.

## Why I Built This

When I started training seriously, I realized I had two problems:

1. I did not know if I was improving in the right way.
2. I did not know what to change from one run to the next.

Pace is my attempt to solve both with an AI coach that works from actual run data, not generic advice.

## What Pace Does Today

- Connects with Strava using OAuth
- Imports my runs and processes stream data
- Calculates overall pace, moving pace, running/walking/stopped distribution, and kilometer splits
- Classifies each run type (long, tempo, easy, short, race effort)
- Generates post-run analysis with specific numbers and one clear recommendation
- Tracks progress on dashboard states (run day, completed run day, rest day)

## Core Product Idea

Every runner should train against a specific distance goal.
Pace is designed around that principle:

- Pick a goal distance (5K, 10K, half, full, or custom)
- Pick a goal type (finish, target time, or target pace)
- Follow day-by-day coaching based on your own run history

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL)
- NextAuth (Strava OAuth)
- Anthropic Claude API
- Strava API v3
- Recharts

## Current Architecture (Simple View)

1. User connects Strava account.
2. App syncs run activities and stream data.
3. Data is preprocessed into compact metrics.
4. Claude receives processed metrics (not raw streams).
5. Analysis and summaries are cached in the database.
6. Dashboard shows state-aware coaching and progress.

## Why Preprocessing Matters

Raw Strava streams can contain thousands of points per run.
Pace preprocesses that into focused metrics before AI analysis so responses are faster, cheaper, and more consistent.

## What Is Already Implemented

- Strava auth and token storage
- Historical sync pipeline
- Run preprocessing and summary generation
- Post-run AI analysis flow
- Dashboard routing and loading states
- Progressive context from previous runs of the same type

## What Is Next

- Weekly plan generation by training phase
- Pre-run brief generation
- Readiness/consistency scoring
- Rest-day routine and polish

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Add environment variables

Create `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=
```

### 3) Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Notes for Contributors

- Keep coaching grounded in real numbers.
- Do not send raw Strava stream payloads directly to the AI model.
- Cache generated AI outputs in the database and avoid regenerating on page load.

---

If you are reading this and training for your own first race: I built this because I wanted clear, honest feedback after every run, and I hope Pace helps you get that too.
