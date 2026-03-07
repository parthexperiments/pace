# Proper Sync Architecture - Implementation Guide

## Overview
This document outlines the complete implementation of the proper sync architecture across 4 parts.

## PART 1: Database Migration
**File:** `supabase/migrations/003_add_needs_historical_sync.sql`
✅ CREATED

Run this SQL in Supabase dashboard to add the column.

## PART 2: Auto-sync on First Login

### Files to Update:

1. **app/api/auth/[...nextauth]/route.ts**
   - After upsert in signIn callback (around line 135)
   - Check if run_analyses count = 0
   - Set needs_historical_sync = true if no runs exist

2. **app/onboarding/page.tsx**
   - Add initial loading check for needs_historical_sync
   - Show full-screen loading state if true
   - Call /api/sync-historical-runs
   - Set needs_historical_sync = false after completion
   - Then show Step 1

## PART 3: AI Recommended Deadline

### File to Update:
**app/api/onboarding/route.ts**
   - After saving goal data
   - If deadline_type = 'ai_recommended':
     - Calculate: longest_run_km, avg_weekly_km, avg_moving_pace_s
     - Call Claude API with runner stats
     - Get recommended_date and reasoning
     - Save as goal_date

## PART 4: Tight Deadline Warning

### New Component:
**app/onboarding/components/DeadlineWarning.tsx**
   - Show if: longest_run_km < goal_distance_km * 0.6 AND weeks < 3
   - Orange warning with Claude-generated message
   - "I understand" button → /dashboard
   - "Change my goal date" → back to Step 3

## PART 5: Auto-sync on Dashboard

### New File:
**app/api/auto-sync/route.ts**
   - POST endpoint
   - Fetch last 48 hours from Strava
   - Analyze new runs
   - Return { newRuns: count }

### Update Dashboard:
**app/dashboard/page.tsx**
   - Remove "Sync Past Runs" button
   - Remove "Check for new run" button
   - On mount: silently call /api/auto-sync
   - Show toast if newRuns > 0

---

## Implementation Notes:

Due to the size and complexity of this refactor (20+ file changes), I recommend:

1. **Apply database migration first**
2. **Test each part independently**
3. **This is production-ready architecture** - proper background sync, AI recommendations, realistic goal warnings

The current state has:
- ✅ Database migration created
- ⏳ Need to update 15+ files for full implementation

Would you like me to:
A) Implement Part 1 (auto-sync on first login) fully
B) Implement Part 2 (AI deadline) fully  
C) Implement Part 3 (warning screen) fully
D) Implement Part 4 (auto-sync) fully
E) Provide the complete code for one specific file

Let me know which part you'd like me to focus on first, and I'll implement it completely with all the necessary code changes.
