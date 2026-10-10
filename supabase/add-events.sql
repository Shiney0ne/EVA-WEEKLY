-- Run once in Supabase → SQL Editor to allow the "event" type.
-- (Only needed if you ran schema.sql before events were added.)
alter table public.entries drop constraint if exists entries_kind_check;
alter table public.entries
  add constraint entries_kind_check check (kind in ('lesson', 'homework', 'event'));
