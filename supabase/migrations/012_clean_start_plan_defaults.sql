-- Migration: align profile defaults with the 2026-06-08 clean-start plan boundary.

alter table public.profiles
  alter column plan_version set default '3.6-jun8-clean-start-2026-06-08';
