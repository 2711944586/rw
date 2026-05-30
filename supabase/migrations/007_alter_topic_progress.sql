-- Migration: Add mastery evidence fields to topic_progress
-- Requirements: 3.4, 2.4

alter table public.topic_progress add column if not exists total_problems integer not null default 0;
alter table public.topic_progress add column if not exists recent_14d_accuracy real not null default 0;
alter table public.topic_progress add column if not exists last_review_at timestamptz;
alter table public.topic_progress add column if not exists mastery_status text not null default 'learning';
alter table public.topic_progress add column if not exists prerequisites text[] not null default '{}';
