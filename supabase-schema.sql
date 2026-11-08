-- Shared couple journal. Row-level security makes the data inaccessible until sign-in.
create table if not exists public.shared_memory (
  id text primary key check (id = 'main'),
  memories jsonb not null default '[]'::jsonb,
  anniversary date,
  updated_at timestamptz not null default now()
);

alter table public.shared_memory enable row level security;

drop policy if exists "signed in can read shared journal" on public.shared_memory;
create policy "signed in can read shared journal"
  on public.shared_memory for select to authenticated using (true);

drop policy if exists "signed in can create shared journal" on public.shared_memory;
create policy "signed in can create shared journal"
  on public.shared_memory for insert to authenticated with check (true);

drop policy if exists "signed in can update shared journal" on public.shared_memory;
create policy "signed in can update shared journal"
  on public.shared_memory for update to authenticated using (true) with check (true);

grant select, insert, update on public.shared_memory to authenticated;

