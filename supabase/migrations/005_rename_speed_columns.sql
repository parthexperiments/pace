-- Rename speed distribution columns to match new terminology
ALTER TABLE public.run_analyses 
RENAME COLUMN shuffling_pct TO walking_pct;

ALTER TABLE public.run_analyses 
RENAME COLUMN stationary_pct TO stopped_pct;
