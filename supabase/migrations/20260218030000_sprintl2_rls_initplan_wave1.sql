-- Sprint L2 wave 1: fix auth_rls_initplan on prospect/research insert policies.

drop policy if exists "prospect_signals_insert_member" on public.prospect_signals;
create policy "prospect_signals_insert_member"
on public.prospect_signals
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "prospect_enrichment_runs_insert_member" on public.prospect_enrichment_runs;
create policy "prospect_enrichment_runs_insert_member"
on public.prospect_enrichment_runs
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "research_runs_insert_member" on public.research_runs;
create policy "research_runs_insert_member"
on public.research_runs
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (requested_by is null or requested_by = (select auth.uid()))
);
