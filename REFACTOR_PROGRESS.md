# Refactor Progress

## ✅ COMPLETED

### PART 1 — Run Type Classification
- ✅ Created `lib/classify-run.ts`
- ✅ Updated `lib/preprocess.ts` to call classifyRun and return run_type
- ✅ Updated all 7 API routes with goal parameters
- ✅ Database column `run_type` added (migration applied)
- ✅ Build passes

### PART 2 — Speed Label Rename  
- ✅ Renamed in `lib/preprocess.ts`: shuffling→walking, stationary→stopped
- ✅ Updated `lib/types.ts`
- ✅ Updated `lib/claude.ts`
- ✅ Updated UI labels in `app/analysis/[activityId]/page.tsx`
- ✅ Database columns renamed (migration applied)

## 🚧 IN PROGRESS

### PART 3 — Moving Pace Display Logic
- Starting now...

### PART 4-8
- Pending...

