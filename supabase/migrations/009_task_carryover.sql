-- Migration: Preserve task carryover lineage.

alter table public.study_tasks add column if not exists source_task_id text not null default '';
alter table public.study_tasks add column if not exists carried_from date;
alter table public.study_tasks add column if not exists shifted_to date;
