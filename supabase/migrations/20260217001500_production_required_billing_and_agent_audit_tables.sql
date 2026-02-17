-- Production baseline: required billing + agent audit tables.

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null unique references public.firms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  polar_customer_id text unique,
  external_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  billing_customer_id uuid not null references public.billing_customers(id) on delete cascade,
  polar_subscription_id text not null unique,
  product_id text,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_subscriptions_firm_id
  on public.billing_subscriptions(firm_id);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references public.firms(id) on delete set null,
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_events_firm_id
  on public.billing_events(firm_id);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  run_type text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  correlation_id text,
  requested_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_firm_id
  on public.agent_runs(firm_id);
create index if not exists idx_agent_runs_firm_status
  on public.agent_runs(firm_id, status);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  step_name text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  step_order integer,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_steps_firm_id
  on public.agent_steps(firm_id);
create index if not exists idx_agent_steps_run_id
  on public.agent_steps(run_id);

create table if not exists public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  step_id uuid references public.agent_steps(id) on delete set null,
  tool_name text not null,
  tool_version text,
  status text not null check (status in ('started', 'completed', 'failed')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_tool_calls_firm_id
  on public.agent_tool_calls(firm_id);
create index if not exists idx_agent_tool_calls_run_id
  on public.agent_tool_calls(run_id);
create index if not exists idx_agent_tool_calls_step_id
  on public.agent_tool_calls(step_id);

drop trigger if exists trg_billing_customers_updated_at on public.billing_customers;
create trigger trg_billing_customers_updated_at
before update on public.billing_customers
for each row execute function app.set_updated_at();

drop trigger if exists trg_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger trg_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row execute function app.set_updated_at();

drop trigger if exists trg_agent_runs_updated_at on public.agent_runs;
create trigger trg_agent_runs_updated_at
before update on public.agent_runs
for each row execute function app.set_updated_at();

drop trigger if exists trg_agent_steps_updated_at on public.agent_steps;
create trigger trg_agent_steps_updated_at
before update on public.agent_steps
for each row execute function app.set_updated_at();

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_steps enable row level security;
alter table public.agent_tool_calls enable row level security;

drop policy if exists "billing_customers_select_member" on public.billing_customers;
create policy "billing_customers_select_member"
on public.billing_customers
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "billing_customers_insert_owner" on public.billing_customers;
create policy "billing_customers_insert_owner"
on public.billing_customers
for insert
to authenticated
with check (app.is_firm_owner(firm_id));

drop policy if exists "billing_customers_update_owner" on public.billing_customers;
create policy "billing_customers_update_owner"
on public.billing_customers
for update
to authenticated
using (app.is_firm_owner(firm_id))
with check (app.is_firm_owner(firm_id));

drop policy if exists "billing_subscriptions_select_member" on public.billing_subscriptions;
create policy "billing_subscriptions_select_member"
on public.billing_subscriptions
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "billing_subscriptions_insert_owner" on public.billing_subscriptions;
create policy "billing_subscriptions_insert_owner"
on public.billing_subscriptions
for insert
to authenticated
with check (app.is_firm_owner(firm_id));

drop policy if exists "billing_subscriptions_update_owner" on public.billing_subscriptions;
create policy "billing_subscriptions_update_owner"
on public.billing_subscriptions
for update
to authenticated
using (app.is_firm_owner(firm_id))
with check (app.is_firm_owner(firm_id));

drop policy if exists "billing_events_select_owner" on public.billing_events;
create policy "billing_events_select_owner"
on public.billing_events
for select
to authenticated
using (firm_id is null or app.is_firm_owner(firm_id));

drop policy if exists "billing_events_insert_owner" on public.billing_events;
create policy "billing_events_insert_owner"
on public.billing_events
for insert
to authenticated
with check (firm_id is null or app.is_firm_owner(firm_id));

drop policy if exists "agent_runs_select_member" on public.agent_runs;
create policy "agent_runs_select_member"
on public.agent_runs
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "agent_runs_insert_member" on public.agent_runs;
create policy "agent_runs_insert_member"
on public.agent_runs
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (requested_by is null or requested_by = auth.uid())
);

drop policy if exists "agent_runs_update_member" on public.agent_runs;
create policy "agent_runs_update_member"
on public.agent_runs
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "agent_steps_select_member" on public.agent_steps;
create policy "agent_steps_select_member"
on public.agent_steps
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "agent_steps_insert_member" on public.agent_steps;
create policy "agent_steps_insert_member"
on public.agent_steps
for insert
to authenticated
with check (app.is_firm_member(firm_id));

drop policy if exists "agent_steps_update_member" on public.agent_steps;
create policy "agent_steps_update_member"
on public.agent_steps
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "agent_tool_calls_select_member" on public.agent_tool_calls;
create policy "agent_tool_calls_select_member"
on public.agent_tool_calls
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "agent_tool_calls_insert_member" on public.agent_tool_calls;
create policy "agent_tool_calls_insert_member"
on public.agent_tool_calls
for insert
to authenticated
with check (app.is_firm_member(firm_id));
