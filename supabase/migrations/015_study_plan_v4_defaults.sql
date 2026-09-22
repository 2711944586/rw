begin;

alter table public.profiles
  alter column plan_version set default '4.0-aug31-operating-plan-2026-08-31';

commit;
