-- Sprint F: Google Calendar sync model + pipeline stage transition audit.

alter table public.prospects
  add column if not exists last_stage_changed_at timestamptz,
  add column if not exists last_stage_changed_by uuid references auth.users(id) on delete set null;

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('google', 'outlook')),
  external_account_id text,
  scope text,
  status text not null default 'connected' check (status in ('connected', 'expired', 'revoked')),
  last_sync_check_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_calendar_connections_firm_user_provider unique (firm_id, user_id, provider)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  external_event_id text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'tentative', 'cancelled', 'unknown')),
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meeting_url text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_calendar_events_provider_external unique (provider, external_event_id)
);

create unique index if not exists uq_calendar_events_idempotent_window
  on public.calendar_events (firm_id, prospect_id, provider, starts_at)
  where status <> 'cancelled';

create table if not exists public.pipeline_stage_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  from_stage app.pipeline_stage,
  to_stage app.pipeline_stage not null,
  source text not null check (source in ('drag_drop', 'drawer_action', 'system')),
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_calendar_connections_firm_provider
  on public.calendar_connections(firm_id, provider);
create index if not exists idx_calendar_events_firm_starts
  on public.calendar_events(firm_id, starts_at desc);
create index if not exists idx_calendar_events_prospect
  on public.calendar_events(prospect_id, starts_at desc);
create index if not exists idx_pipeline_stage_events_firm_prospect
  on public.pipeline_stage_events(firm_id, prospect_id, created_at desc);

alter table public.calendar_connections enable row level security;
alter table public.calendar_events enable row level security;
alter table public.pipeline_stage_events enable row level security;

drop trigger if exists trg_calendar_connections_updated_at on public.calendar_connections;
create trigger trg_calendar_connections_updated_at
before update on public.calendar_connections
for each row execute function app.set_updated_at();

drop trigger if exists trg_calendar_events_updated_at on public.calendar_events;
create trigger trg_calendar_events_updated_at
before update on public.calendar_events
for each row execute function app.set_updated_at();

drop policy if exists "calendar_connections_select_member" on public.calendar_connections;
create policy "calendar_connections_select_member"
on public.calendar_connections
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "calendar_connections_insert_member" on public.calendar_connections;
create policy "calendar_connections_insert_member"
on public.calendar_connections
for insert
to authenticated
with check (app.is_firm_member(firm_id));

drop policy if exists "calendar_connections_update_member" on public.calendar_connections;
create policy "calendar_connections_update_member"
on public.calendar_connections
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "calendar_events_select_member" on public.calendar_events;
create policy "calendar_events_select_member"
on public.calendar_events
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "calendar_events_insert_member" on public.calendar_events;
create policy "calendar_events_insert_member"
on public.calendar_events
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "calendar_events_update_member" on public.calendar_events;
create policy "calendar_events_update_member"
on public.calendar_events
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "pipeline_stage_events_select_member" on public.pipeline_stage_events;
create policy "pipeline_stage_events_select_member"
on public.pipeline_stage_events
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "pipeline_stage_events_insert_member" on public.pipeline_stage_events;
create policy "pipeline_stage_events_insert_member"
on public.pipeline_stage_events
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (actor_id is null or actor_id = auth.uid())
);
