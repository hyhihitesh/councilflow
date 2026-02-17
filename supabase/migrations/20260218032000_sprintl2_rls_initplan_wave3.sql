-- Sprint L2 wave 3: fix auth_rls_initplan on follow-up/calendar/pipeline/reporting insert policies.

drop policy if exists "follow_up_tasks_insert_member" on public.follow_up_tasks;
create policy "follow_up_tasks_insert_member"
on public.follow_up_tasks
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "calendar_events_insert_member" on public.calendar_events;
create policy "calendar_events_insert_member"
on public.calendar_events
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "pipeline_stage_events_insert_member" on public.pipeline_stage_events;
create policy "pipeline_stage_events_insert_member"
on public.pipeline_stage_events
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (actor_id is null or actor_id = (select auth.uid()))
);

drop policy if exists "reporting_runs_insert_member" on public.reporting_runs;
create policy "reporting_runs_insert_member"
on public.reporting_runs
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (created_by is null or created_by = (select auth.uid()))
);
