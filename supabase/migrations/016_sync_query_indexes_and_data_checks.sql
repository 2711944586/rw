-- Supports the date-filtered, paged sync reads in supabase-sync.js.
create index if not exists study_tasks_active_sync_page_idx
  on public.study_tasks (user_id, task_date, id)
  where deleted_at is null;

create index if not exists study_tasks_deleted_sync_page_idx
  on public.study_tasks (user_id, task_date, id)
  where deleted_at is not null;

create index if not exists review_items_active_sync_page_idx
  on public.review_items (user_id, due_date, id)
  where deleted_at is null;

create index if not exists review_items_deleted_sync_page_idx
  on public.review_items (user_id, due_date, id)
  where deleted_at is not null;

create index if not exists mock_scores_active_sync_page_idx
  on public.mock_scores (user_id, mock_date, id)
  where deleted_at is null;

create index if not exists mock_scores_deleted_sync_page_idx
  on public.mock_scores (user_id, mock_date, id)
  where deleted_at is not null;

create index if not exists snapshots_user_recent_idx
  on public.snapshots (user_id, created_at desc);

-- NOT VALID keeps historical rows readable while enforcing these checks on new writes.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_records'::regclass
      and conname = 'daily_records_nonnegative_values_check'
  ) then
    alter table public.daily_records
      add constraint daily_records_nonnegative_values_check check (
        math_minutes >= 0 and cs408_minutes >= 0 and english_minutes >= 0
        and politics_minutes >= 0 and project_minutes >= 0
        and math_problems >= 0 and cs408_problems >= 0 and reading_count >= 0
        and new_mistakes >= 0 and fixed_mistakes >= 0
        and quality_score between 1 and 5
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.study_tasks'::regclass
      and conname = 'study_tasks_valid_state_check'
  ) then
    alter table public.study_tasks
      add constraint study_tasks_valid_state_check check (
        status in ('todo', 'done', 'shifted', 'delayed', 'failed')
        and minutes >= 0 and required_problem_count >= 0
        and required_accuracy between 0 and 100
        and minutes_min >= 0 and minutes_max >= minutes_min
        and actual_problems >= 0 and actual_correct >= 0 and actual_minutes >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.review_items'::regclass
      and conname = 'review_items_valid_state_check'
  ) then
    alter table public.review_items
      add constraint review_items_valid_state_check check (
        status in ('due', 'done', 'delayed', 'failed')
        and delay_count >= 0 and quality_score between 0 and 5
        and interval_index >= 0 and fail_streak >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mock_scores'::regclass
      and conname = 'mock_scores_nonnegative_values_check'
  ) then
    alter table public.mock_scores
      add constraint mock_scores_nonnegative_values_check check (
        politics >= 0 and english >= 0 and math >= 0 and cs408 >= 0 and total >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.topic_progress'::regclass
      and conname = 'topic_progress_bounds_check'
  ) then
    alter table public.topic_progress
      add constraint topic_progress_bounds_check check (
        status_value between 0 and 2 and problems_done >= 0
        and accuracy between 0 and 100 and total_problems >= 0
        and recent_14d_accuracy between 0 and 1
        and mastery_status in ('learning', 'needs_review', 'mastered')
      ) not valid;
  end if;
end $$;
