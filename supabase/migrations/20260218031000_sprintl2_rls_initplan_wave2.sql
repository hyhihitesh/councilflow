-- Sprint L2 wave 2: fix auth_rls_initplan on outreach/agent insert policies.

drop policy if exists "outreach_drafts_insert_member" on public.outreach_drafts;
create policy "outreach_drafts_insert_member"
on public.outreach_drafts
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "outreach_events_insert_member" on public.outreach_events;
create policy "outreach_events_insert_member"
on public.outreach_events
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (actor_id is null or actor_id = (select auth.uid()))
);

drop policy if exists "outreach_approvals_insert_member" on public.outreach_approvals;
create policy "outreach_approvals_insert_member"
on public.outreach_approvals
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (approved_by is null or approved_by = (select auth.uid()))
);

drop policy if exists "outreach_send_attempts_insert_member" on public.outreach_send_attempts;
create policy "outreach_send_attempts_insert_member"
on public.outreach_send_attempts
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (requested_by is null or requested_by = (select auth.uid()))
);

drop policy if exists "agent_runs_insert_member" on public.agent_runs;
create policy "agent_runs_insert_member"
on public.agent_runs
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (requested_by is null or requested_by = (select auth.uid()))
);
