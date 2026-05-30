create table if not exists public.conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  record_id text not null,
  loser_payload jsonb not null,
  winner_payload jsonb not null,
  resolved_at timestamptz not null default now()
);

alter table public.conflicts enable row level security;
create policy "conflicts owner" on public.conflicts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
