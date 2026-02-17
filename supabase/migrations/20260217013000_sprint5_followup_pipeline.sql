-- Sprint 5: follow-up pipeline model, timing rules substrate, and tenant-safe task queue.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pipeline_stage') then
    create type app.pipeline_stage as enum (
      'researched',
      'approved',
      'sent',
      'replied',
      'meeting',
      'won',
      'lost'
    );
  end if;
end $$;

alter table public.prospects
  add column if not exists pipeline_stage app.pipeline_stage not null default 'researched',
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_follow_up_at timestamptz;

create index if not exists idx_prospects_firm_pipeline_stage
  on public.prospects(firm_id, pipeline_stage);
create index if not exists idx_prospects_firm_next_follow_up
  on public.prospects(firm_id, next_follow_up_at)
  where next_follow_up_at is not null;

create table if not exists public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  stage app.pipeline_stage not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  subject text not null check (char_length(subject) >= 5),
  body text not null check (char_length(body) >= 30),
  generated_by text not null default 'followup_rules_v1',
  created_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_follow_up_tasks_pending_prospect
  on public.follow_up_tasks(prospect_id)
  where status = 'pending';

create index if not exists idx_follow_up_tasks_firm_due
  on public.follow_up_tasks(firm_id, due_at)
  where status = 'pending';
create index if not exists idx_follow_up_tasks_firm_status
  on public.follow_up_tasks(firm_id, status);

drop trigger if exists trg_follow_up_tasks_updated_at on public.follow_up_tasks;
create trigger trg_follow_up_tasks_updated_at
before update on public.follow_up_tasks
for each row execute function app.set_updated_at();

alter table public.follow_up_tasks enable row level security;

drop policy if exists "follow_up_tasks_select_member" on public.follow_up_tasks;
create policy "follow_up_tasks_select_member"
on public.follow_up_tasks
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "follow_up_tasks_insert_member" on public.follow_up_tasks;
create policy "follow_up_tasks_insert_member"
on public.follow_up_tasks
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "follow_up_tasks_update_member" on public.follow_up_tasks;
create policy "follow_up_tasks_update_member"
on public.follow_up_tasks
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "follow_up_tasks_delete_owner" on public.follow_up_tasks;
create policy "follow_up_tasks_delete_owner"
on public.follow_up_tasks
for delete
to authenticated
using (app.is_firm_owner(firm_id));
