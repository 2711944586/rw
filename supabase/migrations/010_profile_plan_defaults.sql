-- Migration: align new profile defaults with the 2026-06-01 ramp plan.
-- Existing user choices are not overwritten.

alter table public.profiles
  alter column plan_version set default '3.3-start-2026-06-ramp';

alter table public.profiles
  alter column density_mode set default 'focus';
