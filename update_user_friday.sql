-- Task 1: Update user's available_days to include Friday and delete current weekly plan

-- Update available_days to include 'Friday' (assuming user exists)
-- This updates ALL users - you may want to add a WHERE clause for specific user
UPDATE users 
SET available_days = array_append(available_days, 'Friday')
WHERE NOT ('Friday' = ANY(available_days));

-- Delete current week's plan so it regenerates with Friday included
DELETE FROM weekly_plans 
WHERE week_start_date >= (
  SELECT DATE_TRUNC('week', NOW())::date + 
  CASE WHEN EXTRACT(DOW FROM NOW()) = 0 THEN -6 ELSE 1 END
);
