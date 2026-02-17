-- Sprint 2 follow-up: allow firm members to read teammate profile names.

drop policy if exists "profiles_select_same_firm" on public.profiles;
create policy "profiles_select_same_firm"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or exists (
    select 1
    from public.firm_memberships fm_self
    join public.firm_memberships fm_target
      on fm_self.firm_id = fm_target.firm_id
    where fm_self.user_id = auth.uid()
      and fm_target.user_id = profiles.id
  )
);

