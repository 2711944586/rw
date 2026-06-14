-- Migration: align profile defaults with the 2026-06-15 clean-start plan boundary.

alter table public.profiles
  alter column plan_version set default '3.7-jun15-clean-start-2026-06-15';
