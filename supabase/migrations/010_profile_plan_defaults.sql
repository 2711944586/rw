-- Migration: align new profile defaults with the 2026-06-08 evidence-based ramp plan.
-- Existing user choices are not overwritten.

alter table public.profiles
  alter column plan_version set default '3.4-start-2026-06-08-evidence';

alter table public.profiles
  alter column density_mode set default 'focus';
