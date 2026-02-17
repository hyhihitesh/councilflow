-- Sprint L2: RLS initplan optimization for content_drafts insert policy.
-- Use SELECT-wrapped auth/function calls to avoid per-row re-evaluation.

drop policy if exists "content_drafts_insert_member" on public.content_drafts;
create policy "content_drafts_insert_member"
on public.content_drafts
for insert
to authenticated
with check (
  (select app.is_firm_member(firm_id))
  and (created_by is null or created_by = (select auth.uid()))
);
