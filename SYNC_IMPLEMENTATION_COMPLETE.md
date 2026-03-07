# Proper Sync Architecture - Implementation Complete

All 4 parts have been successfully implemented:

## ✅ PART 1: New User Auto-Sync on First Login

### Files Modified:
- `app/api/auth/[...nextauth]/route.ts` - Added logic to check run count and set `needs_historical_sync` flag
- `app/onboarding/page.tsx` - Added loading screen, historical sync check, and progress bar
- `app/api/user/status/route.ts` - Added `needs_historical_sync` to response
- `app/api/user/update-sync-status/route.ts` - **NEW** - Endpoint to update sync status

### How It Works:
1. After OAuth sign-in, NextAuth checks if user has any runs in `run_analyses`
2. If count = 0, sets `needs_historical_sync = true` in users table
3. Onboarding page checks this flag before showing Step 1
4. If true, shows full-screen loading animation and calls `/api/sync-historical-runs`
5. When complete, updates flag to false and proceeds to onboarding

---

## ✅ PART 2: AI Recommended Deadline Insight

### Files Modified:
- `app/api/onboarding/route.ts` - Added Claude integration for deadline recommendation

### How It Works:
1. When user selects `deadline_type = 'ai_recommended'`, API calculates:
   - Longest run (km)
   - Avg weekly km (last 4 weeks)
   - Avg moving pace (last 4 weeks)
2. Calls Claude with runner profile to recommend a realistic `goal_date` and reasoning
3. Saves recommended date to `users.goal_date`
4. Returns AI reasoning in response (can be displayed if needed)

---

## ✅ PART 3: Tight Deadline Warning

### Files Created:
- `app/onboarding/components/DeadlineWarning.tsx` - **NEW** - Warning screen component
- `app/api/check-deadline-warning/route.ts` - **NEW** - Endpoint to check and generate warning

### Files Modified:
- `app/onboarding/page.tsx` - Added warning check logic and state management

### How It Works:
1. After onboarding completes, checks if:
   - `longest_run_km < goal_distance_km * 0.6` AND
   - `weeks_to_goal < 3`
2. If true, calls Claude to generate a personalized warning message
3. Shows warning screen with two options:
   - "I understand — let's go" → proceeds to dashboard
   - "Change my goal date" → returns to Step 3

---

## ✅ PART 4: Background Sync & Remove Manual Buttons

### Files Created:
- `app/api/auto-sync/route.ts` - **NEW** - Background sync endpoint

### Files Modified:
- `app/dashboard/page.tsx`:
  - Removed "Sync Past Runs" button and banner
  - Removed `handleSyncHistoricalRuns` function
  - Removed `handleCheckNewRun` function
  - Removed `checking` and `syncingHistory` state
  - Added `autoSyncInBackground()` function
  - Added toast notification UI for new runs
  - Auto-sync runs on page load

### How It Works:
1. Dashboard calls `/api/auto-sync` silently on page load
2. API fetches Strava activities from last 48 hours
3. For each new run (not in `run_analyses`):
   - Fetches streams and activity details
   - Preprocesses data
   - Calls Claude for analysis
   - Stores in database
   - Waits 400ms before next (rate limiting)
4. If new runs found, shows toast notification: "X new runs detected and analyzed"
5. Refreshes dashboard data automatically

---

## Database Migration Required

Before testing, apply the migration:

**File:** `supabase/migrations/003_add_needs_historical_sync.sql`

```sql
ALTER TABLE public.users 
ADD COLUMN needs_historical_sync boolean DEFAULT true;

UPDATE public.users u
SET needs_historical_sync = false
WHERE EXISTS (
  SELECT 1 FROM public.run_analyses ra
  WHERE ra.user_id = u.id
);
```

Apply via Supabase SQL Editor.

---

## Testing Checklist

### Part 1 - New User Auto-Sync:
- [ ] Sign in with a new Strava account (no runs in DB)
- [ ] Verify loading screen appears with "Analyzing your run history"
- [ ] Verify progress bar animates
- [ ] Verify onboarding steps appear after sync completes

### Part 2 - AI Recommended Deadline:
- [ ] Complete onboarding with "Not sure yet — help me decide" option
- [ ] Verify a `goal_date` is set in the database
- [ ] Check terminal logs for Claude's reasoning (optional)

### Part 3 - Tight Deadline Warning:
- [ ] Complete onboarding with a goal date < 3 weeks away
- [ ] Ensure longest run < 60% of goal distance
- [ ] Verify warning screen appears with Claude-generated message
- [ ] Test both "Accept" and "Change date" buttons

### Part 4 - Background Sync:
- [ ] Upload a new run to Strava (within last 48 hours)
- [ ] Load dashboard
- [ ] Verify toast notification appears: "1 new run detected and analyzed"
- [ ] Verify no manual sync buttons are visible
- [ ] Verify dashboard data refreshes automatically

---

## Key Benefits

1. **Seamless onboarding** - New users get instant personalized insights
2. **Intelligent deadlines** - AI recommends realistic race dates
3. **Honest coaching** - Warns users about unrealistic goals upfront
4. **Zero friction** - No manual sync buttons, everything automatic
5. **Real-time updates** - Dashboard stays current without user action

---

## Token Optimization Notes

- Historical sync: 400ms delay between Claude calls (rate limiting)
- Auto-sync: Only checks last 48 hours (not entire history)
- Cached analyses: Never regenerate existing run analyses
- Single Claude call per feature (no multiple attempts)

---

## Next Steps

All sync architecture features are complete! You can now:
1. Apply the database migration
2. Test each part systematically
3. Monitor Claude API usage in Anthropic console
4. Adjust rate limiting delays if needed
