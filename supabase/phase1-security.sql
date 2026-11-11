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
