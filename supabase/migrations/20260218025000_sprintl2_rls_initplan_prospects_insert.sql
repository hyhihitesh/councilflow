-- Sprint L2: RLS initplan optimization for prospects insert policy.

drop policy if exists "prospects_insert_member" on public.prospects;
create policy "prospects_insert_member"
on public.prospects
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (created_by is null or created_by = (select auth.uid()))
);
