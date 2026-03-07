-- Add needs_historical_sync column to users table

ALTER TABLE public.users 
ADD COLUMN needs_historical_sync boolean DEFAULT true;

-- Set to false for existing users who already have run analyses
UPDATE public.users u
SET needs_historical_sync = false
WHERE EXISTS (
  SELECT 1 FROM public.run_analyses ra
  WHERE ra.user_id = u.id
);
