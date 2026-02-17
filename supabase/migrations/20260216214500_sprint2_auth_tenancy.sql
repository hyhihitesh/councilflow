-- Sprint 2 foundation: tenancy, memberships, and RLS policies.
-- Aligned with inhumans.io V1 multi-tenant security model.

create extension if not exists pgcrypto;

create schema if not exists app;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app.app_role as enum ('owner', 'attorney', 'ops');
  end if;
end $$;

create table if not exists public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) >= 2),
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.firm_memberships (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app.app_role not null default 'attorney',
  created_at timestamptz not null default now(),
  unique (firm_id, user_id)
);

create index if not exists idx_firm_memberships_user_id on public.firm_memberships(user_id);
create index if not exists idx_firm_memberships_firm_id on public.firm_memberships(firm_id);
create index if not exists idx_firm_memberships_firm_role on public.firm_memberships(firm_id, role);

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_firms_updated_at on public.firms;
create trigger trg_firms_updated_at
before update on public.firms
for each row execute function app.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function app.set_updated_at();

create or replace function app.is_firm_member(target_firm uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.firm_memberships fm
    where fm.firm_id = target_firm
      and fm.user_id = auth.uid()
  );
$$;

create or replace function app.is_firm_owner(target_firm uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.firm_memberships fm
    where fm.firm_id = target_firm
      and fm.user_id = auth.uid()
      and fm.role = 'owner'
  );
$$;

create or replace function public.create_firm_with_owner(firm_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_firm_id uuid;
  caller_id uuid;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.firms(name)
  values (firm_name)
  returning id into new_firm_id;

  insert into public.firm_memberships(firm_id, user_id, role)
  values (new_firm_id, caller_id, 'owner');

  return new_firm_id;
end;
$$;

revoke all on function public.create_firm_with_owner(text) from public;
grant execute on function public.create_firm_with_owner(text) to authenticated;

alter table public.firms enable row level security;
alter table public.profiles enable row level security;
alter table public.firm_memberships enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "firms_select_member" on public.firms;
create policy "firms_select_member"
on public.firms
for select
to authenticated
using (app.is_firm_member(id));

drop policy if exists "firms_update_owner" on public.firms;
create policy "firms_update_owner"
on public.firms
for update
to authenticated
using (app.is_firm_owner(id))
with check (app.is_firm_owner(id));

drop policy if exists "memberships_select_same_firm" on public.firm_memberships;
create policy "memberships_select_same_firm"
on public.firm_memberships
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "memberships_insert_owner" on public.firm_memberships;
create policy "memberships_insert_owner"
on public.firm_memberships
for insert
to authenticated
with check (app.is_firm_owner(firm_id));

drop policy if exists "memberships_update_owner" on public.firm_memberships;
create policy "memberships_update_owner"
on public.firm_memberships
for update
to authenticated
using (app.is_firm_owner(firm_id))
with check (app.is_firm_owner(firm_id));

drop policy if exists "memberships_delete_owner" on public.firm_memberships;
create policy "memberships_delete_owner"
on public.firm_memberships
for delete
to authenticated
using (app.is_firm_owner(firm_id));
