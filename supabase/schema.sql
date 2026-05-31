create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  target_exam_date date,
  weekday_minutes integer not null default 120,
  weekend_minutes integer not null default 210,
  task_count integer not null default 3,
  core_ratio integer not null default 65,
  review_days integer[] not null default array[1,3,7,14,30],
  plan_version text not null default '3.3-start-2026-06-ramp',
  density_mode text not null default 'focus',
  retro_time text not null default '22:00',
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  math_minutes integer not null default 0,
  cs408_minutes integer not null default 0,
  english_minutes integer not null default 0,
  politics_minutes integer not null default 0,
  project_minutes integer not null default 0,
  math_problems integer not null default 0,
  cs408_problems integer not null default 0,
  reading_count integer not null default 0,
  new_mistakes integer not null default 0,
  fixed_mistakes integer not null default 0,
  quality_score integer not null default 3,
  next_task text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, study_date)
);

create table if not exists public.study_tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  subject text not null,
  topic_id text not null default '',
  title text not null,
  minutes integer not null default 0,
  priority integer not null default 0,
  status text not null default 'todo',
  locked boolean not null default false,
  source text not null default 'generated',
  source_task_id text not null default '',
  carried_from date,
  shifted_to date,
  completed_at timestamptz,
  record_applied boolean not null default false,
  contract_type text not null default 'problems',
  required_problem_count integer not null default 0,
  required_accuracy real not null default 0,
  required_artifacts text[] not null default '{}',
  minutes_min integer not null default 0,
  minutes_max integer not null default 0,
  actual_problems integer not null default 0,
  actual_correct integer not null default 0,
  actual_minutes integer not null default 0,
  evidence_submitted boolean not null default false,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.review_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_task_id text not null default '',
  subject text not null,
  title text not null,
  review_round text not null,
  due_date date not null,
  status text not null default 'due',
  delay_count integer not null default 0,
  failure_reason text not null default '',
  quality_score integer not null default 0,
  completed_at timestamptz,
  interval_index integer not null default 0,
  fail_streak integer not null default 0,
  last_result text not null default '',
  last_submitted_date date,
  topic_id text not null default '',
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.topic_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  status_value integer not null default 0,
  problems_done integer not null default 0,
  accuracy integer not null default 0,
  evidence text not null default '',
  last_review_date date,
  total_problems integer not null default 0,
  recent_14d_accuracy real not null default 0,
  last_review_at timestamptz,
  mastery_status text not null default 'learning',
  prerequisites text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table if not exists public.mock_scores (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mock_date date not null,
  name text not null,
  politics integer not null default 0,
  english integer not null default 0,
  math integer not null default 0,
  cs408 integer not null default 0,
  total integer not null default 0,
  note text not null default '',
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.resources (
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_key text not null,
  progress integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, resource_key)
);

create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'manual',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

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

create table if not exists public.conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  record_id text not null,
  loser_payload jsonb not null,
  winner_payload jsonb not null,
  resolved_at timestamptz not null default now()
);

create table if not exists public.calibration_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkpoint_date date not null,
  input_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default now()
);

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

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'study_tasks'
      and constraint_name = 'study_tasks_pkey'
  ) and not exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'study_tasks'
      and constraint_name = 'study_tasks_pkey'
      and column_name = 'user_id'
  ) then
    alter table public.study_tasks drop constraint study_tasks_pkey;
    alter table public.study_tasks add constraint study_tasks_pkey primary key (user_id, id);
  end if;

  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'review_items'
      and constraint_name = 'review_items_pkey'
  ) and not exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'review_items'
      and constraint_name = 'review_items_pkey'
      and column_name = 'user_id'
  ) then
    alter table public.review_items drop constraint review_items_pkey;
    alter table public.review_items add constraint review_items_pkey primary key (user_id, id);
  end if;

  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'mock_scores'
      and constraint_name = 'mock_scores_pkey'
  ) and not exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'mock_scores'
      and constraint_name = 'mock_scores_pkey'
      and column_name = 'user_id'
  ) then
    alter table public.mock_scores drop constraint mock_scores_pkey;
    alter table public.mock_scores add constraint mock_scores_pkey primary key (user_id, id);
  end if;

  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'source_registry'
      and constraint_name = 'source_registry_pkey'
  ) and not exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'source_registry'
      and constraint_name = 'source_registry_pkey'
      and column_name = 'user_id'
  ) then
    alter table public.source_registry drop constraint source_registry_pkey;
    alter table public.source_registry add constraint source_registry_pkey primary key (user_id, claim_id);
  end if;

  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'project_showcase_items'
      and constraint_name = 'project_showcase_items_pkey'
  ) and not exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'project_showcase_items'
      and constraint_name = 'project_showcase_items_pkey'
      and column_name = 'user_id'
  ) then
    alter table public.project_showcase_items drop constraint project_showcase_items_pkey;
    alter table public.project_showcase_items add constraint project_showcase_items_pkey primary key (user_id, id);
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.daily_records enable row level security;
alter table public.study_tasks enable row level security;
alter table public.review_items enable row level security;
alter table public.topic_progress enable row level security;
alter table public.mock_scores enable row level security;
alter table public.resources enable row level security;
alter table public.snapshots enable row level security;
alter table public.source_registry enable row level security;
alter table public.conflicts enable row level security;
alter table public.calibration_snapshots enable row level security;
alter table public.project_showcase_items enable row level security;

drop policy if exists "profiles owner" on public.profiles;
drop policy if exists "daily_records owner" on public.daily_records;
drop policy if exists "study_tasks owner" on public.study_tasks;
drop policy if exists "review_items owner" on public.review_items;
drop policy if exists "topic_progress owner" on public.topic_progress;
drop policy if exists "mock_scores owner" on public.mock_scores;
drop policy if exists "resources owner" on public.resources;
drop policy if exists "snapshots owner" on public.snapshots;
drop policy if exists "source_registry owner" on public.source_registry;
drop policy if exists "conflicts owner" on public.conflicts;
drop policy if exists "calibration_snapshots owner" on public.calibration_snapshots;
drop policy if exists "project_showcase_items owner" on public.project_showcase_items;

create policy "profiles owner" on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "daily_records owner" on public.daily_records for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "study_tasks owner" on public.study_tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "review_items owner" on public.review_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "topic_progress owner" on public.topic_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mock_scores owner" on public.mock_scores for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "resources owner" on public.resources for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "snapshots owner" on public.snapshots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "source_registry owner" on public.source_registry for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conflicts owner" on public.conflicts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "calibration_snapshots owner" on public.calibration_snapshots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "project_showcase_items owner" on public.project_showcase_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
