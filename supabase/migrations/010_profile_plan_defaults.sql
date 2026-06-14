-- Migration: align new profile defaults with the evidence-based ramp plan.
-- Existing user choices are not overwritten.

alter table public.profiles
  alter column plan_version set default '3.7-jun15-clean-start-2026-06-15';

alter table public.profiles
  alter column density_mode set default 'focus';
