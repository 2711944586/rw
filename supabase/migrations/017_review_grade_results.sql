-- Existing databases already have review_items_valid_state_check, so a new
-- constraint is required. NOT VALID leaves historical rows readable.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.review_items'::regclass
      and conname = 'review_items_last_result_check'
  ) then
    alter table public.review_items
      add constraint review_items_last_result_check check (
        last_result in ('', 'pass', 'fail', 'delay', 'again', 'hard', 'good', 'easy')
      ) not valid;
  end if;
end $$;
