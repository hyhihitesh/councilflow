-- Sprint 5: Content Studio drafts for LinkedIn and newsletter workflows.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_channel') then
    create type app.content_channel as enum ('linkedin', 'newsletter');
  end if;
end $$;

create table if not exists public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  channel app.content_channel not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published')),
  title text not null check (char_length(title) >= 8),
  body text not null check (char_length(body) >= 60),
  topic text,
  preview_payload jsonb not null default '{}'::jsonb,
  generated_by text not null default 'content_studio_v1',
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_drafts_firm_channel_status
  on public.content_drafts(firm_id, channel, status);
create index if not exists idx_content_drafts_firm_created_at
  on public.content_drafts(firm_id, created_at desc);
create index if not exists idx_content_drafts_firm_topic
  on public.content_drafts(firm_id, topic)
  where topic is not null and btrim(topic) <> '';

drop trigger if exists trg_content_drafts_updated_at on public.content_drafts;
create trigger trg_content_drafts_updated_at
before update on public.content_drafts
for each row execute function app.set_updated_at();

alter table public.content_drafts enable row level security;

drop policy if exists "content_drafts_select_member" on public.content_drafts;
create policy "content_drafts_select_member"
on public.content_drafts
for select
to authenticated
using (app.is_firm_member(firm_id));

drop policy if exists "content_drafts_insert_member" on public.content_drafts;
create policy "content_drafts_insert_member"
on public.content_drafts
for insert
to authenticated
with check (
  app.is_firm_member(firm_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "content_drafts_update_member" on public.content_drafts;
create policy "content_drafts_update_member"
on public.content_drafts
for update
to authenticated
using (app.is_firm_member(firm_id))
with check (app.is_firm_member(firm_id));

drop policy if exists "content_drafts_delete_owner" on public.content_drafts;
create policy "content_drafts_delete_owner"
on public.content_drafts
for delete
to authenticated
using (app.is_firm_owner(firm_id));
