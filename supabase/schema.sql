-- Run this once in Supabase → SQL Editor.

-- Who is the parent and who is the child
create table if not exists public.app_roles (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('parent', 'child'))
);
alter table public.app_roles enable row level security;
drop policy if exists "read own role" on public.app_roles;
create policy "read own role" on public.app_roles
  for select to authenticated using (user_id = auth.uid());

-- Lessons and homework
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  kind text not null check (kind in ('lesson', 'homework')),
  subject text not null default '',
  title text not null,
  details text not null default '',
  start_time text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists entries_day_idx on public.entries (day);
alter table public.entries enable row level security;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.app_roles where user_id = auth.uid()
$$;
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

drop policy if exists "family reads" on public.entries;
drop policy if exists "parent inserts" on public.entries;
drop policy if exists "parent updates" on public.entries;
drop policy if exists "parent deletes" on public.entries;
create policy "family reads" on public.entries
  for select to authenticated using (public.my_role() in ('parent', 'child'));
create policy "parent inserts" on public.entries
  for insert to authenticated with check (public.my_role() = 'parent');
create policy "parent updates" on public.entries
  for update to authenticated using (public.my_role() = 'parent') with check (public.my_role() = 'parent');
create policy "parent deletes" on public.entries
  for delete to authenticated using (public.my_role() = 'parent');

-- The child may only tick homework done / not done
create or replace function public.set_entry_done(entry_id uuid, is_done boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is null then
    raise exception 'not allowed';
  end if;
  update public.entries set done = is_done where id = entry_id and kind = 'homework';
end
$$;
revoke execute on function public.set_entry_done(uuid, boolean) from public, anon;
grant execute on function public.set_entry_done(uuid, boolean) to authenticated;

-- ── After creating the two users in Authentication → Users, run: ──
-- insert into public.app_roles (user_id, role)
--   select id, 'parent' from auth.users where email = 'parent@family.local'
--   on conflict (user_id) do update set role = excluded.role;
-- insert into public.app_roles (user_id, role)
--   select id, 'child' from auth.users where email = 'eva@family.local'
--   on conflict (user_id) do update set role = excluded.role;
