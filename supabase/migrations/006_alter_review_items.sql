alter table public.review_items add column if not exists interval_index integer not null default 0;
alter table public.review_items add column if not exists fail_streak integer not null default 0;
alter table public.review_items add column if not exists last_result text not null default '';
alter table public.review_items add column if not exists last_submitted_date date;
alter table public.review_items add column if not exists topic_id text not null default '';
