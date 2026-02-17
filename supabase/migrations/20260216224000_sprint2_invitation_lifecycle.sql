-- Sprint 2: invitation lifecycle tracking for owner-managed access control.

create table if not exists public.firm_invitations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role app.app_role not null check (role in ('attorney', 'ops')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_firm_invitations_firm_id
  on public.firm_invitations(firm_id);

create index if not exists idx_firm_invitations_email
  on public.firm_invitations(lower(email));

create unique index if not exists uq_firm_invitations_pending_email
  on public.firm_invitations(firm_id, lower(email))
  where status = 'pending';

drop trigger if exists trg_firm_invitations_updated_at on public.firm_invitations;
create trigger trg_firm_invitations_updated_at
before update on public.firm_invitations
for each row execute function app.set_updated_at();

alter table public.firm_invitations enable row level security;

drop policy if exists "invites_select_owner" on public.firm_invitations;
create policy "invites_select_owner"
on public.firm_invitations
for select
to authenticated
using (app.is_firm_owner(firm_id));

drop policy if exists "invites_insert_owner" on public.firm_invitations;
create policy "invites_insert_owner"
on public.firm_invitations
for insert
to authenticated
with check (app.is_firm_owner(firm_id) and invited_by = auth.uid());

drop policy if exists "invites_update_owner" on public.firm_invitations;
create policy "invites_update_owner"
on public.firm_invitations
for update
to authenticated
using (app.is_firm_owner(firm_id))
with check (app.is_firm_owner(firm_id));

drop policy if exists "invites_delete_owner" on public.firm_invitations;
create policy "invites_delete_owner"
on public.firm_invitations
for delete
to authenticated
using (app.is_firm_owner(firm_id));

