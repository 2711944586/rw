create table if not exists public.project_showcase_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  artifact_type text not null default '',
  item_date date,
  output_link text not null default '',
  description text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.project_showcase_items enable row level security;
create policy "project_showcase_items owner" on public.project_showcase_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
