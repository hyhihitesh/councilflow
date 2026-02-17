-- Production hardening: enforce idempotent outreach send attempts per draft.

create table if not exists public.outreach_send_attempts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  draft_id uuid not null unique references public.outreach_drafts(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null check (status in ('sending', 'sent', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  provider text,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outreach_send_attempts_firm_id
  on public.outreach_send_attempts(firm_id);
create index if not exists idx_outreach_send_attempts_status
  on public.outreach_send_attempts(status);

drop trigger if exists trg_outreach_send_attempts_updated_at on public.outreach_send_attempts;
create trigger trg_outreach_send_attempts_updated_at
before update on public.outreach_send_attempts
for each row execute function app.set_updated_at();

alter table public.outreach_send_attempts enable row level security;

drop policy if exists "outreach_send_attempts_select_member" on public.outreach_send_attempts;
create policy "outreach_send_attempts_select_member"
on public.outreach_send_attempts
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "outreach_send_attempts_insert_member" on public.outreach_send_attempts;
create policy "outreach_send_attempts_insert_member"
on public.outreach_send_attempts
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (requested_by is null or requested_by = auth.uid())
);

drop policy if exists "outreach_send_attempts_update_member" on public.outreach_send_attempts;
create policy "outreach_send_attempts_update_member"
on public.outreach_send_attempts
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));
