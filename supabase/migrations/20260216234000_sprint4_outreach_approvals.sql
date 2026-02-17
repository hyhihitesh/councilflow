-- Sprint 4: approval gate model for outbound outreach send.

create table if not exists public.outreach_approvals (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  draft_id uuid not null unique references public.outreach_drafts(id) on delete cascade,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  decision_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_approvals_firm_id
  on public.outreach_approvals(firm_id);
create index if not exists idx_outreach_approvals_prospect_id
  on public.outreach_approvals(prospect_id);
create index if not exists idx_outreach_approvals_approved_at
  on public.outreach_approvals(approved_at desc);

alter table public.outreach_approvals enable row level security;

drop policy if exists "outreach_approvals_select_member" on public.outreach_approvals;
create policy "outreach_approvals_select_member"
on public.outreach_approvals
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "outreach_approvals_insert_member" on public.outreach_approvals;
create policy "outreach_approvals_insert_member"
on public.outreach_approvals
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (approved_by is null or approved_by = auth.uid())
);

drop policy if exists "outreach_approvals_update_owner" on public.outreach_approvals;
create policy "outreach_approvals_update_owner"
on public.outreach_approvals
for update
to authenticated
using (app.is_firm_owner(firm_id))
with check (app.is_firm_owner(firm_id));

drop policy if exists "outreach_approvals_delete_owner" on public.outreach_approvals;
create policy "outreach_approvals_delete_owner"
on public.outreach_approvals
for delete
to authenticated
using (app.is_firm_owner(firm_id));
