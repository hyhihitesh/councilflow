-- Sprint L2: FK index backlog cleanup (wave 1).
-- Targets current Supabase advisor warnings for unindexed foreign keys.

create index if not exists idx_agent_runs_requested_by
  on public.agent_runs(requested_by);

create index if not exists idx_firm_invitations_invited_by
  on public.firm_invitations(invited_by);

create index if not exists idx_firm_invitations_invited_user_id
  on public.firm_invitations(invited_user_id);

create index if not exists idx_outreach_send_attempts_requested_by
  on public.outreach_send_attempts(requested_by);

create index if not exists idx_prospect_enrichment_runs_created_by
  on public.prospect_enrichment_runs(created_by);

create index if not exists idx_prospect_signals_created_by
  on public.prospect_signals(created_by);

create index if not exists idx_reporting_runs_created_by
  on public.reporting_runs(created_by);
