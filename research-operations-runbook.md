# inhumans.io Scheduler Ops Runbook

## Purpose
This runbook covers scheduled execution, monitoring, and incident response for:
- Weekly research runs.
- Daily follow-up generation.
- Weekly Wednesday content draft generation.
- Weekly reporting digest generation.
- Real-time mailbox webhook ingestion (opens/replies).
- Google calendar meeting sync and pipeline stage transitions.

## Required Environment Variables
- `RESEARCH_SCHEDULER_TOKEN`: token for research scheduler endpoint.
- `FOLLOW_UP_SCHEDULER_TOKEN`: token for daily follow-up scheduler endpoint.
- `CONTENT_SCHEDULER_TOKEN`: token for weekly content scheduler endpoint.
- `REPORTING_SCHEDULER_TOKEN`: token for weekly reporting scheduler endpoint.
- `CRON_SECRET`: optional fallback token (compatible with hosted cron providers).
- `SCHEDULED_FIRM_BATCH_LIMIT`: max firms per scheduler invocation.
- `SCHEDULED_PROSPECT_LIMIT_PER_FIRM`: max prospects per firm for scheduled runs.
- `FOLLOW_UP_SCHEDULER_BATCH_LIMIT`: max firms per daily follow-up invocation.
- `FOLLOW_UP_SCHEDULER_PROSPECT_LIMIT`: max due prospects processed per firm.
- `CONTENT_SCHEDULER_BATCH_LIMIT`: max firms per weekly content invocation.
- `CONTENT_SCHEDULER_TOPIC`: default topic for generated weekly drafts.
- `CONTENT_SCHEDULER_ALLOW_NON_WEDNESDAY`: set `1` only for controlled backfills/testing.
- `REPORTING_SCHEDULER_BATCH_LIMIT`: max firms per weekly reporting invocation.
- `REPORTING_DELIVERY_MODE`: `log` or `resend` (`log` is the emergency fallback mode).
- `REPORTING_DIGEST_RECIPIENTS`: comma-separated recipients for `email_stub`/`resend` mode.
- `RESEND_API_KEY`: required when `REPORTING_DELIVERY_MODE=resend`.
- `REPORTING_FROM_EMAIL`: sender address for Resend delivery.
- `REPORTING_REPLY_TO_EMAIL`: optional reply-to address for Resend delivery.
- `MAILBOX_WEBHOOK_SECRET`: HMAC secret for mailbox webhook signature verification.
- `MAILBOX_WEBHOOK_VERIFY_SIGNATURE`: set `0` only for controlled local testing.
- `MAILBOX_WEBHOOK_HEALTH_TOKEN`: token for mailbox webhook health endpoint.
- `GOOGLE_CALENDAR_DEFAULT_ID`: calendar id to write events to (default `primary`).
- `GOOGLE_CALENDAR_TIMEOUT_MS`: timeout for Google Calendar API calls.
- `CALENDAR_SYNC_PROVIDER`: current provider (`google` in Sprint F).
- `CALENDAR_SYNC_ENABLED`: set `0` to temporarily disable calendar APIs.
- `CALENDAR_MEETING_AUTO_CREATE`: auto-create calendar event when stage move to meeting includes required fields.
- `RESEARCH_PROVIDER_TIMEOUT_MS`: provider request timeout in milliseconds.
- `RESEARCH_TELEMETRY_ENABLED`: set `0` to disable JSON telemetry logs.

## Endpoints
- `POST /api/research/schedule/weekly`
  - Triggers scheduled research runs.
  - Auth: `x-inhumans-scheduler-token`, `Authorization: Bearer`, or `?token=`.
- `GET /api/research/schedule/weekly`
  - Returns scheduler health and recent scheduled run failures.
  - Same auth requirement as `POST`.
- `POST /api/follow-ups/schedule/daily`
  - Generates due follow-up tasks by firm (idempotent per firm/day).
  - Auth: `x-inhumans-scheduler-token`, `Authorization: Bearer`, or `?token=`.
- `GET /api/follow-ups/schedule/daily`
  - Returns follow-up scheduler health and recent failures.
  - Same auth requirement as `POST`.
- `POST /api/content/drafts/schedule/weekly`
  - Generates LinkedIn + newsletter drafts by firm (idempotent per firm/week).
  - Runs Wednesday UTC unless `CONTENT_SCHEDULER_ALLOW_NON_WEDNESDAY=1`.
  - Auth: `x-inhumans-scheduler-token`, `Authorization: Bearer`, or `?token=`.
- `GET /api/content/drafts/schedule/weekly`
  - Returns content scheduler health and recent failures.
  - Same auth requirement as `POST`.
- `POST /api/reporting/schedule/weekly`
  - Generates weekly digest payload and delivery records by firm.
  - Uses previous completed UTC week window.
  - Auth: `x-inhumans-scheduler-token`, `Authorization: Bearer`, or `?token=`.
- `GET /api/reporting/schedule/weekly`
  - Returns reporting scheduler health and recent failures.
  - Same auth requirement as `POST`.
- `POST /api/webhook/mailbox`
  - Ingests mailbox reply/open events with idempotent event IDs.
  - Signature header supported: `x-inhumans-signature` (`sha256=...`).
- `GET /api/webhook/mailbox`
  - Returns recent mailbox events and dead-letter failures.
  - Auth: `x-inhumans-scheduler-token`, `Authorization: Bearer`, or `?token=` using `MAILBOX_WEBHOOK_HEALTH_TOKEN` (or `CRON_SECRET` fallback).
- `POST /api/research/runs`
  - Manual and retry execution endpoint.
- `POST /api/pipeline/stage-move`
  - Persists drag/drop stage transitions and writes `pipeline_stage_events`.
  - Hybrid behavior: optional auto-calendar create for meeting stage.
- `POST /api/calendar/events/create`
  - Manual calendar event create and linkage for a prospect.
- `GET /api/calendar/events/by-prospect`
  - Returns linked calendar event for a prospect (optional `refresh=1`).

## Scheduler Wiring
- Vercel cron is configured in `apps/web/vercel.json`:
  - Path: `/api/follow-ups/schedule/daily`
  - Schedule: `0 13 * * *` (daily, 13:00 UTC)
  - Path: `/api/content/drafts/schedule/weekly`
  - Schedule: `0 14 * * 3` (Wednesday, 14:00 UTC)
  - Path: `/api/research/schedule/weekly`
  - Schedule: `0 13 * * 1` (every Monday, 13:00 UTC)
  - Path: `/api/reporting/schedule/weekly`
  - Schedule: `0 15 * * 1` (every Monday, 15:00 UTC)

## Monitoring Signals
- Dashboard section: `Research Orchestrator`
  - Watch `Scheduled failures` and `Last scheduled run`.
  - Use `Retry as manual` on failed scheduled runs.
- Telemetry logs (JSON)
  - `research_run_request`
  - `research_run_finished`
  - `provider_run_start`
  - `provider_run_success`
  - `provider_run_error`
  - `scheduler_weekly_start`
  - `scheduler_weekly_finished`
  - `followup_scheduler_auth_failed`
  - `content_scheduler_auth_failed`
  - `reporting_scheduler_auth_failed`
  - `reporting_delivery_success`
  - `reporting_delivery_failure`
  - `reporting_delivery_exhausted`
  - Mailbox observability via `message_events` and `message_event_failures` tables.
  - Pipeline audit: `pipeline_stage_events`.
  - Calendar linkage health: `calendar_events`.

## Incident Playbook
1. Check scheduler health endpoints for failed runs:
   - `GET /api/follow-ups/schedule/daily?token=...`
   - `GET /api/content/drafts/schedule/weekly?token=...`
   - `GET /api/research/schedule/weekly?token=...`
   - `GET /api/reporting/schedule/weekly?token=...`
2. For research failures, open dashboard and review scheduled failure table.
3. Retry affected research runs from UI (`Retry as manual`).
4. If research provider failures persist:
   - Increase `RESEARCH_PROVIDER_TIMEOUT_MS` moderately.
   - Reduce batch pressure using `SCHEDULED_FIRM_BATCH_LIMIT` or `SCHEDULED_PROSPECT_LIMIT_PER_FIRM`.
5. For follow-up/content failures:
   - Verify scheduler token and cron wiring.
   - Validate `scheduler_runs` records for `status = failed`.
   - Re-run `POST` endpoint manually with token after fixing cause.
6. For reporting failures:
   - Inspect `reporting_runs` and `reporting_deliveries` for status/error details.
   - Re-run reporting scheduler manually after fixing delivery or data issues.
7. For mailbox webhook failures:
   - Check `message_event_failures` for malformed payload patterns.
   - Validate signature secret and provider webhook signing config.
   - Verify idempotency behavior in `message_events` (`provider + external_event_id` unique).
8. For calendar sync failures:
   - Check OAuth provider connection status in settings.
   - Inspect calendar API error codes (`oauth_reauth_required`, `calendar_provider_unavailable`).
   - Validate persisted link rows in `calendar_events` and stage logs in `pipeline_stage_events`.
9. Validate recovery by confirming:
   - New successful scheduled/manual runs.
   - Failed count drops in scheduler health response.

## Reporting Delivery Incident Triage
Use this flow for top reporting incidents without opening DB console first:

1. Open dashboard/analytics reporting observability card.
2. Capture:
   - `Last run at`
   - `Failed (last run)`
   - `Top error codes (last run)`
   - `Retries exhausted`
3. Follow incident-specific path below.

### Incident A: Recipient misconfiguration (`recipient_unconfigured`)
1. Confirm `REPORTING_DIGEST_RECIPIENTS` is set with comma-separated valid emails.
2. Verify no trailing invalid separators and no blank values.
3. Trigger `POST /api/reporting/schedule/weekly` with scheduler token.
4. Confirm failed count returns to `0` and latest run moves to completed.

### Incident B: Resend credential/API failure (`delivery_config_missing`, `resend_http_401`, `resend_http_403`)
1. Verify `RESEND_API_KEY` is present and rotated secret is active.
2. Verify `REPORTING_FROM_EMAIL` uses a verified Resend sender/domain.
3. If credential rotation happened, redeploy to refresh runtime env.
4. Trigger manual scheduler run and verify deliveries transition from `failed` to `sent`.

### Incident C: Retry exhaustion (`resend_http_429`, `resend_http_5xx`, `resend_network_error`)
1. Confirm `Retries exhausted` count and top code from observability block.
2. If `429`, reduce scheduler batch pressure temporarily (`REPORTING_SCHEDULER_BATCH_LIMIT`).
3. If `5xx`/network, wait for provider recovery window and rerun manually.
4. Validate new run completes with decreased failed delivery count.

## Emergency Rollback (Reporting Delivery Mode)
Use when delivery provider is degraded and digest generation must continue:

1. Set `REPORTING_DELIVERY_MODE=log`.
2. Deploy/restart service so env changes are active.
3. Trigger manual reporting scheduler run to validate log-path completion.
4. Keep mode in `log` until provider incident is resolved.
5. Restore `REPORTING_DELIVERY_MODE=resend` and verify with one manual run before resuming cron-only operations.

## Guardrails
- Concurrency lock: only one active research run per firm.
- Retry cap: max 3 retries for run-based retries.
- Provider calls are timeout-bounded and fail fast.
- Idempotency markers: `scheduler_runs(job_name, firm_id, window_key)` unique constraint prevents duplicate daily/weekly firm runs.
