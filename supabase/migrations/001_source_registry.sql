create table if not exists public.source_registry (
  claim_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_text text not null,
  claim_type text not null default 'general',
  source_url text not null,
  source_publisher text not null default '',
  fetched_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  verified_by text not null default 'system',
  verification_status text not null default 'verified',
  updated_at timestamptz not null default now()
);

alter table public.source_registry enable row level security;
create policy "source_registry owner" on public.source_registry
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
