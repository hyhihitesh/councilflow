-- Sprint 3 foundation: prospect intelligence schema + tenant-safe RLS.

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  source text not null default 'manual',
  company_name text not null check (char_length(company_name) >= 2),
  domain text,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_title text,
  linkedin_url text,
  status text not null default 'new'
    check (status in ('new', 'enriched', 'qualified', 'disqualified', 'archived')),
  fit_score numeric(5,2),
  score_version text,
  score_explanation jsonb not null default '[]'::jsonb,
  last_activity_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fit_score is null or (fit_score >= 0 and fit_score <= 100))
);

create index if not exists idx_prospects_firm_id
  on public.prospects(firm_id);
create index if not exists idx_prospects_firm_status
  on public.prospects(firm_id, status);
create index if not exists idx_prospects_firm_score_desc
  on public.prospects(firm_id, fit_score desc nulls last);
create unique index if not exists uq_prospects_firm_domain
  on public.prospects(firm_id, lower(domain))
  where domain is not null and btrim(domain) <> '';
create unique index if not exists uq_prospects_firm_contact_email
  on public.prospects(firm_id, lower(primary_contact_email))
  where primary_contact_email is not null and btrim(primary_contact_email) <> '';

drop trigger if exists trg_prospects_updated_at on public.prospects;
create trigger trg_prospects_updated_at
before update on public.prospects
for each row execute function app.set_updated_at();

create table if not exists public.prospect_signals (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  signal_type text not null,
  signal_source text not null,
  signal_strength smallint check (signal_strength is null or (signal_strength >= 0 and signal_strength <= 100)),
  summary text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prospect_signals_firm_id
  on public.prospect_signals(firm_id);
create index if not exists idx_prospect_signals_prospect_id
  on public.prospect_signals(prospect_id);
create index if not exists idx_prospect_signals_firm_type
  on public.prospect_signals(firm_id, signal_type);

create table if not exists public.prospect_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  provider text not null check (provider in ('tavily', 'firecrawl', 'internal')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'partial')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  estimated_cost_usd numeric(10,4) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prospect_enrichment_runs_firm_id
  on public.prospect_enrichment_runs(firm_id);
create index if not exists idx_prospect_enrichment_runs_prospect_id
  on public.prospect_enrichment_runs(prospect_id);
create index if not exists idx_prospect_enrichment_runs_firm_status
  on public.prospect_enrichment_runs(firm_id, status);

create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('manual', 'scheduled', 'retry')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  retry_count integer not null default 0 check (retry_count >= 0),
  requested_by uuid references auth.users(id) on delete set null,
  error_message text,
  run_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_runs_firm_id
  on public.research_runs(firm_id);
create index if not exists idx_research_runs_firm_status
  on public.research_runs(firm_id, status);
create index if not exists idx_research_runs_firm_created_at
  on public.research_runs(firm_id, created_at desc);

drop trigger if exists trg_research_runs_updated_at on public.research_runs;
create trigger trg_research_runs_updated_at
before update on public.research_runs
for each row execute function app.set_updated_at();

alter table public.prospects enable row level security;
alter table public.prospect_signals enable row level security;
alter table public.prospect_enrichment_runs enable row level security;
alter table public.research_runs enable row level security;

drop policy if exists "prospects_select_member" on public.prospects;
create policy "prospects_select_member"
on public.prospects
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "prospects_insert_member" on public.prospects;
create policy "prospects_insert_member"
on public.prospects
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "prospects_update_member" on public.prospects;
create policy "prospects_update_member"
on public.prospects
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "prospects_delete_owner" on public.prospects;
create policy "prospects_delete_owner"
on public.prospects
for delete
to authenticated
using (app.is_firm_owner(firm_id));

drop policy if exists "prospect_signals_select_member" on public.prospect_signals;
create policy "prospect_signals_select_member"
on public.prospect_signals
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "prospect_signals_insert_member" on public.prospect_signals;
create policy "prospect_signals_insert_member"
on public.prospect_signals
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "prospect_signals_update_member" on public.prospect_signals;
create policy "prospect_signals_update_member"
on public.prospect_signals
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "prospect_signals_delete_owner" on public.prospect_signals;
create policy "prospect_signals_delete_owner"
on public.prospect_signals
for delete
to authenticated
using (app.is_firm_owner(firm_id));

drop policy if exists "prospect_enrichment_runs_select_member" on public.prospect_enrichment_runs;
create policy "prospect_enrichment_runs_select_member"
on public.prospect_enrichment_runs
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "prospect_enrichment_runs_insert_member" on public.prospect_enrichment_runs;
create policy "prospect_enrichment_runs_insert_member"
on public.prospect_enrichment_runs
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "prospect_enrichment_runs_update_member" on public.prospect_enrichment_runs;
create policy "prospect_enrichment_runs_update_member"
on public.prospect_enrichment_runs
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "prospect_enrichment_runs_delete_owner" on public.prospect_enrichment_runs;
create policy "prospect_enrichment_runs_delete_owner"
on public.prospect_enrichment_runs
for delete
to authenticated
using (app.is_firm_owner(firm_id));

drop policy if exists "research_runs_select_member" on public.research_runs;
create policy "research_runs_select_member"
on public.research_runs
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "research_runs_insert_member" on public.research_runs;
create policy "research_runs_insert_member"
on public.research_runs
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (requested_by is null or requested_by = auth.uid())
);

drop policy if exists "research_runs_update_member" on public.research_runs;
create policy "research_runs_update_member"
on public.research_runs
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "research_runs_delete_owner" on public.research_runs;
create policy "research_runs_delete_owner"
on public.research_runs
for delete
to authenticated
using (app.is_firm_owner(firm_id));
