-- Phase 1 security migration for Our Little World.
-- Run only after the legacy shared_memory table exists.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists private.user_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and length(username) between 1 and 32),
  email text not null unique,
  role text not null default 'user' check (role in ('admin','user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table private.user_accounts enable row level security;
revoke all on private.user_accounts from public, anon, authenticated;

create or replace function public.current_user_active()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.user_accounts
    where user_id = auth.uid() and is_active = true
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.user_accounts
    where user_id = auth.uid() and is_active = true and role = 'admin'
  );
$$;
revoke all on function public.current_user_active() from public, anon;
revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_active() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "signed in can read shared journal" on public.shared_memory;
drop policy if exists "signed in can create shared journal" on public.shared_memory;
drop policy if exists "signed in can update shared journal" on public.shared_memory;
drop policy if exists "active users read shared journal" on public.shared_memory;
drop policy if exists "active users create shared journal" on public.shared_memory;
drop policy if exists "active users update shared journal" on public.shared_memory;
create policy "active users read shared journal"
  on public.shared_memory for select to authenticated using (public.current_user_active());
create policy "active users create shared journal"
  on public.shared_memory for insert to authenticated with check (public.current_user_active());
create policy "active users update shared journal"
  on public.shared_memory for update to authenticated
  using (public.current_user_active()) with check (public.current_user_active());
grant select, insert, update on public.shared_memory to authenticated;

-- Service-role Edge Functions only: never grant clients access to private.user_accounts.

-- Resolve usernames through a service-only RPC; the login browser never receives this email mapping.
create or replace function public.lookup_login_account(p_username text)
returns table(email text, is_active boolean)
language sql
security definer
set search_path = ''
as $$
  select ua.email, ua.is_active
  from private.user_accounts ua
  where ua.username = lower(p_username)
  limit 1;
$$;
revoke all on function public.lookup_login_account(text) from public, anon, authenticated;
grant execute on function public.lookup_login_account(text) to service_role;

-- Create Auth users first in the Supabase dashboard with these email identifiers:
-- z@ourlittleworld.invalid and c@ourlittleworld.invalid
-- Then this statement maps them to the only two allowed account names: Z and C.
insert into private.user_accounts (user_id, username, email, role, is_active)
select id,
       case lower(email) when 'z@ourlittleworld.invalid' then 'z' else 'c' end,
       lower(email), 'admin', true
from auth.users
where lower(email) in ('z@ourlittleworld.invalid', 'c@ourlittleworld.invalid')
on conflict (user_id) do update
set username = excluded.username, email = excluded.email, role = 'admin', is_active = true;
