alter table public.profiles add column if not exists density_mode text not null default 'focus';
alter table public.profiles add column if not exists retro_time text not null default '22:00';
alter table public.profiles add column if not exists last_synced_at timestamptz;
