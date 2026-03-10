-- Add run_summary_json column for compressed progressive analysis
ALTER TABLE public.run_analyses 
ADD COLUMN run_summary_json jsonb;
