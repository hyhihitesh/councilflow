-- Sprint L1: reporting delivery retries + billing trial access lifecycle + onboarding profile expansion.

alter table if exists public.reporting_deliveries
  drop constraint if exists reporting_deliveries_delivery_mode_check;

alter table if exists public.reporting_deliveries
  add constraint reporting_deliveries_delivery_mode_check
  check (delivery_mode in ('log', 'email', 'email_stub', 'resend'));

alter table if exists public.reporting_deliveries
  add column if not exists attempt_count integer not null default 1,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text;

alter table if exists public.reporting_deliveries
  add constraint reporting_deliveries_attempt_count_check
  check (attempt_count > 0);

create index if not exists idx_reporting_deliveries_attempt_status
  on public.reporting_deliveries(firm_id, status, attempt_count desc);

alter table if exists public.billing_subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists access_state text;

alter table if exists public.billing_subscriptions
  drop constraint if exists billing_subscriptions_access_state_check;

alter table if exists public.billing_subscriptions
  add constraint billing_subscriptions_access_state_check
  check (access_state is null or access_state in ('active', 'grace', 'read_only'));

create index if not exists idx_billing_subscriptions_access_state
  on public.billing_subscriptions(firm_id, access_state, updated_at desc);

create index if not exists idx_billing_subscriptions_trial_window
  on public.billing_subscriptions(firm_id, trial_ends_at, grace_ends_at)
  where trial_ends_at is not null;

alter table if exists public.profiles
  add column if not exists practice_areas text[] not null default '{}',
  add column if not exists office_location text,
  add column if not exists avg_matter_value numeric,
  add column if not exists icp_profile jsonb not null default '{}'::jsonb,
  add column if not exists voice_profile jsonb not null default '{}'::jsonb;
