-- Sprint L2 wave 4: consolidate permissive SELECT policies for linter performance.

drop policy if exists "invites_select_owner" on public.firm_invitations;
drop policy if exists "invites_select_recipient" on public.firm_invitations;
create policy "invites_select_access"
on public.firm_invitations
for select
to authenticated
using (
  (select app.is_firm_owner(firm_id))
  or (
    status = 'pending'
    and lower(email) = (select app.user_email())
  )
);

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_same_firm" on public.profiles;
create policy "profiles_select_access"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or exists (
    select 1
    from public.firm_memberships fm_self
    join public.firm_memberships fm_target
      on fm_self.firm_id = fm_target.firm_id
    where fm_self.user_id = (select auth.uid())
      and fm_target.user_id = profiles.id
  )
);
