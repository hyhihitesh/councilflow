-- Sprint D: Weekly reporting runs and delivery tracking.

create table if not exists public.reporting_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  summary_title text,
  digest_payload jsonb not null default '{}'::jsonb,
  generated_by text not null default 'reporting_agent_v1',
  created_by uuid references auth.users(id) on delete set null,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_reporting_runs_firm_week unique (firm_id, week_start)
);

create table if not exists public.reporting_deliveries (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  reporting_run_id uuid not null references public.reporting_runs(id) on delete cascade,
  delivery_mode text not null check (delivery_mode in ('log', 'email')),
  recipient text not null,
  status text not null check (status in ('queued', 'sent', 'failed')),
  provider text not null default 'internal',
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reporting_runs_firm_created
  on public.reporting_runs(firm_id, created_at desc);
create index if not exists idx_reporting_runs_status
  on public.reporting_runs(status);
create index if not exists idx_reporting_deliveries_run_created
  on public.reporting_deliveries(reporting_run_id, created_at desc);
create index if not exists idx_reporting_deliveries_firm_status
  on public.reporting_deliveries(firm_id, status);

alter table public.reporting_runs enable row level security;
alter table public.reporting_deliveries enable row level security;

drop trigger if exists trg_reporting_runs_updated_at on public.reporting_runs;
create trigger trg_reporting_runs_updated_at
before update on public.reporting_runs
for each row execute function app.set_updated_at();

drop trigger if exists trg_reporting_deliveries_updated_at on public.reporting_deliveries;
create trigger trg_reporting_deliveries_updated_at
before update on public.reporting_deliveries
for each row execute function app.set_updated_at();

drop policy if exists "reporting_runs_select_member" on public.reporting_runs;
create policy "reporting_runs_select_member"
on public.reporting_runs
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "reporting_runs_insert_member" on public.reporting_runs;
create policy "reporting_runs_insert_member"
on public.reporting_runs
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "reporting_runs_update_member" on public.reporting_runs;
create policy "reporting_runs_update_member"
on public.reporting_runs
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "reporting_deliveries_select_member" on public.reporting_deliveries;
create policy "reporting_deliveries_select_member"
on public.reporting_deliveries
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "reporting_deliveries_insert_member" on public.reporting_deliveries;
create policy "reporting_deliveries_insert_member"
on public.reporting_deliveries
for insert
to authenticated
with check (app.is_firm_member(firm_id));
