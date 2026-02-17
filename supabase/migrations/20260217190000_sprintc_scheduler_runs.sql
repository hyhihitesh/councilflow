-- Sprint C: Scheduler idempotency markers and execution history.

create table if not exists public.scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  firm_id uuid not null references public.firms(id) on delete cascade,
  window_key text not null,
  status text not null check (status in ('started', 'completed', 'failed', 'skipped')),
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_scheduler_runs_job_firm_window unique (job_name, firm_id, window_key)
);

create index if not exists idx_scheduler_runs_job_created
  on public.scheduler_runs(job_name, created_at desc);
create index if not exists idx_scheduler_runs_firm_created
  on public.scheduler_runs(firm_id, created_at desc);
create index if not exists idx_scheduler_runs_status
  on public.scheduler_runs(status);

alter table public.scheduler_runs enable row level security;

drop trigger if exists trg_scheduler_runs_updated_at on public.scheduler_runs;
create trigger trg_scheduler_runs_updated_at
before update on public.scheduler_runs
for each row execute function app.set_updated_at();

drop policy if exists "scheduler_runs_select_owner" on public.scheduler_runs;
create policy "scheduler_runs_select_owner"
on public.scheduler_runs
for select
to authenticated
using (app.is_firm_owner(firm_id));
