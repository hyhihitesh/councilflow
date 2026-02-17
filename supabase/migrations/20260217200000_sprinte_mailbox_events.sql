-- Sprint E: mailbox event backbone with idempotency, dead-letter capture, and follow-up signal queue.

alter table public.prospects
  add column if not exists is_hot_lead boolean not null default false,
  add column if not exists hot_lead_reason text,
  add column if not exists last_opened_at timestamptz,
  add column if not exists last_replied_at timestamptz;

create index if not exists idx_prospects_firm_hot_lead
  on public.prospects(firm_id, is_hot_lead)
  where is_hot_lead = true;

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  provider text not null check (provider in ('gmail', 'outlook', 'generic')),
  external_event_id text not null,
  event_type text not null check (event_type in ('opened', 'replied')),
  event_occurred_at timestamptz not null,
  signature_verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_message_events_provider_event unique (provider, external_event_id)
);

create index if not exists idx_message_events_firm_created
  on public.message_events(firm_id, created_at desc);
create index if not exists idx_message_events_prospect_created
  on public.message_events(prospect_id, created_at desc);
create index if not exists idx_message_events_type_created
  on public.message_events(event_type, created_at desc);

create table if not exists public.message_event_failures (
  id uuid primary key default gen_random_uuid(),
  provider text,
  error_code text not null,
  error_message text not null,
  payload text not null,
  signature_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_message_event_failures_created
  on public.message_event_failures(created_at desc);

create table if not exists public.follow_up_decision_signals (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  message_event_id uuid not null references public.message_events(id) on delete cascade,
  signal_type text not null check (signal_type in ('reply', 'open')),
  status text not null default 'queued' check (status in ('queued', 'processed', 'dismissed')),
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_follow_up_signal_message_event unique (message_event_id)
);

create index if not exists idx_follow_up_signals_firm_status
  on public.follow_up_decision_signals(firm_id, status, created_at desc);

alter table public.message_events enable row level security;
alter table public.message_event_failures enable row level security;
alter table public.follow_up_decision_signals enable row level security;

drop trigger if exists trg_message_events_updated_at on public.message_events;
create trigger trg_message_events_updated_at
before update on public.message_events
for each row execute function app.set_updated_at();

drop trigger if exists trg_follow_up_decision_signals_updated_at on public.follow_up_decision_signals;
create trigger trg_follow_up_decision_signals_updated_at
before update on public.follow_up_decision_signals
for each row execute function app.set_updated_at();

drop policy if exists "message_events_select_member" on public.message_events;
create policy "message_events_select_member"
on public.message_events
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "message_events_insert_owner" on public.message_events;
create policy "message_events_insert_owner"
on public.message_events
for insert
to authenticated
with check (app.is_firm_owner(firm_id));

drop policy if exists "message_events_update_owner" on public.message_events;
create policy "message_events_update_owner"
on public.message_events
for update
to authenticated
using (app.is_firm_owner(firm_id))
with check (app.is_firm_owner(firm_id));

drop policy if exists "message_event_failures_select_owner" on public.message_event_failures;
create policy "message_event_failures_select_owner"
on public.message_event_failures
for select
to authenticated
using (true);

drop policy if exists "follow_up_decision_signals_select_member" on public.follow_up_decision_signals;
create policy "follow_up_decision_signals_select_member"
on public.follow_up_decision_signals
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "follow_up_decision_signals_insert_member" on public.follow_up_decision_signals;
create policy "follow_up_decision_signals_insert_member"
on public.follow_up_decision_signals
for insert
to authenticated
with check (app.is_firm_member(firm_id));

drop policy if exists "follow_up_decision_signals_update_member" on public.follow_up_decision_signals;
create policy "follow_up_decision_signals_update_member"
on public.follow_up_decision_signals
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));
