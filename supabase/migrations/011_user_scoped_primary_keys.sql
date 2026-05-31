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
