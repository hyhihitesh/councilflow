-- Sprint L2: FK index coverage + targeted RLS init-plan optimization.

-- Wave 1 FK indexes (highest-write/join paths).
create index if not exists idx_research_runs_requested_by
  on public.research_runs(requested_by);

create index if not exists idx_outreach_events_draft_id
  on public.outreach_events(draft_id);

create index if not exists idx_outreach_events_actor_id
  on public.outreach_events(actor_id);

create index if not exists idx_follow_up_tasks_created_by
  on public.follow_up_tasks(created_by);

create index if not exists idx_follow_up_tasks_completed_by
  on public.follow_up_tasks(completed_by);

create index if not exists idx_content_drafts_created_by
  on public.content_drafts(created_by);

create index if not exists idx_content_drafts_approved_by
  on public.content_drafts(approved_by);

create index if not exists idx_content_drafts_published_by
  on public.content_drafts(published_by);

create index if not exists idx_billing_subscriptions_billing_customer_id
  on public.billing_subscriptions(billing_customer_id);

create index if not exists idx_billing_customers_user_id
  on public.billing_customers(user_id);

-- Wave 2 FK indexes (if time in sprint, included here for completeness).
create index if not exists idx_outreach_drafts_created_by
  on public.outreach_drafts(created_by);

create index if not exists idx_outreach_drafts_approved_by
  on public.outreach_drafts(approved_by);

create index if not exists idx_outreach_approvals_approved_by
  on public.outreach_approvals(approved_by);

create index if not exists idx_prospects_created_by
  on public.prospects(created_by);

create index if not exists idx_prospects_last_stage_changed_by
  on public.prospects(last_stage_changed_by);

-- RLS init-plan optimization: wrap auth.uid() calls with SELECT so auth is initialized once.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "profiles_select_same_firm" on public.profiles;
create policy "profiles_select_same_firm"
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

drop policy if exists "invites_insert_owner" on public.firm_invitations;
create policy "invites_insert_owner"
on public.firm_invitations
for insert
to authenticated
with check (app.is_firm_owner(firm_id) and invited_by = (select auth.uid()));
