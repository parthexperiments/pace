-- Add run_type column to run_analyses table
ALTER TABLE public.run_analyses 
ADD COLUMN run_type text;

-- Add check constraint for valid run types
ALTER TABLE public.run_analyses
ADD CONSTRAINT run_type_check 
CHECK (run_type IN ('long', 'tempo', 'easy', 'short', 'race_effort', 'strength'));
