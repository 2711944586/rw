-- Migration: Add Task Contract fields to study_tasks
-- Requirements: 3.1, 3.2, 3.3

alter table public.study_tasks add column if not exists contract_type text not null default 'problems';
alter table public.study_tasks add column if not exists required_problem_count integer not null default 0;
alter table public.study_tasks add column if not exists required_accuracy real not null default 0;
alter table public.study_tasks add column if not exists required_artifacts text[] not null default '{}';
alter table public.study_tasks add column if not exists minutes_min integer not null default 0;
alter table public.study_tasks add column if not exists minutes_max integer not null default 0;
alter table public.study_tasks add column if not exists actual_problems integer not null default 0;
alter table public.study_tasks add column if not exists actual_correct integer not null default 0;
alter table public.study_tasks add column if not exists actual_minutes integer not null default 0;
alter table public.study_tasks add column if not exists evidence_submitted boolean not null default false;
