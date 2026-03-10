# Major Analysis Pipeline Refactor - Implementation Status

## All 8 Parts Complete ✅

### PART 1 — Run Type Classification ✅
- Migration `004_add_run_type.sql`, `lib/classify-run.ts`, `preprocessRun()` integration, all API call sites updated.

### PART 2 — Speed Label Rename ✅
- Migration `005_rename_speed_columns.sql`, `walking_pct`/`stopped_pct` everywhere, UI labels "Walking"/"Stopped".

### PART 3 — Moving Pace Display Logic ✅
- Analysis page: Overall pace primary; moving pace, stopped %, pace gap only when `stopped_pct > 0.10`.
- Dashboard: Overall pace primary; pace gap only when `stopped_pct > 0.10`.

### PART 4 — Compressed Previous Run Summary ✅
- `run_summary_json` generated after analysis via `extractRunSummaryFromAnalysis()`; stored in `run_analyses`.

### PART 5 — Progressive Analysis with Previous Run Memory ✅
- Fetch previous run of same `run_type`; compute `recommendation_followed`; update previous row; pass context to Claude; `previous_run_assessment` in response.

### PART 6 — Analysis Page Update ✅
- Run type badge (colours: long=blue, tempo=orange, easy=green, short=grey, race_effort=red).
- Section 1.5 "Progress Since Last [Run Type]" with `previous_run_assessment` or "First X on record".

### PART 7 — Weekly Plan Strength Sessions ✅
- Generate-plan prompt requires 4–5 exercises with name, sets, reps, note; phase-scaled sets.
- Plan page displays exercises with sets/reps and running-specific note.

### PART 8 — Dynamic Open Analysis Prompt ✅
- New system/user prompts in `lib/claude.ts`; TODAY'S RUN DATA conditional on `stopped_pct`; response: `run_type_confirmed`, `key_insight`, `previous_run_assessment`, `coach_paragraphs`, `performance_vs_plan`, `one_thing`.

---

## Breaking note

Delete existing `run_analyses` rows if you want historical runs re-analysed with the new pipeline (run_type, run_summary_json, progressive context).
