create table if not exists public.calibration_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkpoint_date date not null,
  input_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.calibration_snapshots enable row level security;
create policy "calibration_snapshots owner" on public.calibration_snapshots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
