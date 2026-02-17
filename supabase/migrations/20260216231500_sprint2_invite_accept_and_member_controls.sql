-- Sprint 2: invite acceptance + safer member management primitives.

create or replace function app.user_email()
returns text
language sql
stable
as $$
  select lower(coalesce((auth.jwt() ->> 'email'), ''));
$$;

drop policy if exists "invites_select_recipient" on public.firm_invitations;
create policy "invites_select_recipient"
on public.firm_invitations
for select
to authenticated
using (
  status = 'pending'
  and lower(email) = app.user_email()
);

create or replace function public.accept_firm_invitation(invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  caller_email text;
  target_invite public.firm_invitations%rowtype;
begin
  caller_id := auth.uid();
  caller_email := app.user_email();

  if caller_id is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_invite
  from public.firm_invitations
  where id = invitation_id
    and status = 'pending'
  limit 1;

  if target_invite.id is null then
    raise exception 'invitation not found';
  end if;

  if lower(target_invite.email) <> caller_email then
    raise exception 'invitation email mismatch';
  end if;

  if target_invite.expires_at < now() then
    update public.firm_invitations
    set status = 'expired',
        responded_at = now()
    where id = target_invite.id;

    raise exception 'invitation expired';
  end if;

  insert into public.firm_memberships (firm_id, user_id, role)
  values (target_invite.firm_id, caller_id, target_invite.role)
  on conflict (firm_id, user_id)
  do update set role = excluded.role;

  update public.firm_invitations
  set status = 'accepted',
      invited_user_id = caller_id,
      responded_at = now()
  where id = target_invite.id;

  return target_invite.firm_id;
end;
$$;

revoke all on function public.accept_firm_invitation(uuid) from public;
grant execute on function public.accept_firm_invitation(uuid) to authenticated;

