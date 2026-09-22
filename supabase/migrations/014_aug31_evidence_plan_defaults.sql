-- Align defaults for accounts created after the 2026-08-31 plan reset.
-- Existing user time-budget choices remain unchanged.

alter table public.profiles
  alter column weekday_minutes set default 180,
  alter column weekend_minutes set default 300,
  alter column plan_version set default '3.8-aug31-evidence-plan-2026-08-31';
