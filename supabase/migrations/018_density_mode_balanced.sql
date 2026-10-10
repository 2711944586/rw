-- Density no longer offers a third "focus" mode.
-- Existing rows that stored the retired value move to balanced.
-- Old migrations stay untouched.

alter table public.profiles alter column density_mode set default 'balanced';

update public.profiles
set density_mode = 'balanced'
where density_mode = 'focus';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_density_mode_check'
  ) then
    alter table public.profiles
      add constraint profiles_density_mode_check
      check (density_mode in ('balanced', 'detail')) not valid;
  end if;
end $$;
