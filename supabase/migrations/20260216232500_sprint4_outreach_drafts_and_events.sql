-- Sprint 4 foundation: outreach drafts, review decisions, and audit events.

create table if not exists public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  variant text not null check (variant in ('direct', 'warm', 'content_led')),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'skipped', 'sent')),
  subject text not null check (char_length(subject) >= 5),
  body text not null check (char_length(body) >= 30),
  voice_score numeric(5,2) check (voice_score is null or (voice_score >= 0 and voice_score <= 100)),
  compliance_notes jsonb not null default '[]'::jsonb,
  generated_by text not null default 'writer_v1',
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outreach_drafts_firm_id
  on public.outreach_drafts(firm_id);
create index if not exists idx_outreach_drafts_prospect_id
  on public.outreach_drafts(prospect_id);
create index if not exists idx_outreach_drafts_firm_status
  on public.outreach_drafts(firm_id, status);
create index if not exists idx_outreach_drafts_firm_prospect_variant
  on public.outreach_drafts(firm_id, prospect_id, variant, version desc);

drop trigger if exists trg_outreach_drafts_updated_at on public.outreach_drafts;
create trigger trg_outreach_drafts_updated_at
before update on public.outreach_drafts
for each row execute function app.set_updated_at();

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  draft_id uuid references public.outreach_drafts(id) on delete cascade,
  action_type text not null
    check (action_type in ('generated', 'approved', 'edited', 'regenerated', 'skipped', 'sent')),
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_events_firm_id
  on public.outreach_events(firm_id);
create index if not exists idx_outreach_events_prospect_id
  on public.outreach_events(prospect_id);
create index if not exists idx_outreach_events_action_type
  on public.outreach_events(action_type);

alter table public.outreach_drafts enable row level security;
alter table public.outreach_events enable row level security;

drop policy if exists "outreach_drafts_select_member" on public.outreach_drafts;
create policy "outreach_drafts_select_member"
on public.outreach_drafts
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "outreach_drafts_insert_member" on public.outreach_drafts;
create policy "outreach_drafts_insert_member"
on public.outreach_drafts
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "outreach_drafts_update_member" on public.outreach_drafts;
create policy "outreach_drafts_update_member"
on public.outreach_drafts
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "outreach_drafts_delete_owner" on public.outreach_drafts;
create policy "outreach_drafts_delete_owner"
on public.outreach_drafts
for delete
to authenticated
using (app.is_firm_owner(firm_id));

drop policy if exists "outreach_events_select_member" on public.outreach_events;
create policy "outreach_events_select_member"
on public.outreach_events
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "outreach_events_insert_member" on public.outreach_events;
create policy "outreach_events_insert_member"
on public.outreach_events
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (actor_id is null or actor_id = auth.uid())
);
