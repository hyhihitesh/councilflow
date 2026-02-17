-- Sprint L2: promote content publish provider metadata to first-class columns.

alter table public.content_drafts
  add column if not exists publish_adapter text,
  add column if not exists published_via text,
  add column if not exists provider text,
  add column if not exists provider_status text,
  add column if not exists provider_post_id text,
  add column if not exists provider_published_at timestamptz,
  add column if not exists provider_error_code text,
  add column if not exists provider_error_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_drafts_publish_adapter_check'
      and conrelid = 'public.content_drafts'::regclass
  ) then
    alter table public.content_drafts
      add constraint content_drafts_publish_adapter_check
      check (
        publish_adapter is null
        or publish_adapter in ('manual_copy', 'linkedin_api')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_drafts_provider_status_check'
      and conrelid = 'public.content_drafts'::regclass
  ) then
    alter table public.content_drafts
      add constraint content_drafts_provider_status_check
      check (
        provider_status is null
        or provider_status in ('skipped', 'manual_copy', 'already_published', 'published', 'failed')
      );
  end if;
end $$;

create index if not exists idx_content_drafts_provider_post_id
  on public.content_drafts(provider_post_id)
  where provider_post_id is not null and btrim(provider_post_id) <> '';

create index if not exists idx_content_drafts_provider_status
  on public.content_drafts(firm_id, provider_status)
  where provider_status is not null and btrim(provider_status) <> '';

update public.content_drafts
set
  publish_adapter = coalesce(publish_adapter, nullif(preview_payload ->> 'publish_adapter', '')),
  published_via = coalesce(published_via, nullif(preview_payload ->> 'published_via', '')),
  provider = coalesce(provider, nullif(preview_payload ->> 'provider', '')),
  provider_status = coalesce(provider_status, nullif(preview_payload ->> 'provider_status', '')),
  provider_post_id = coalesce(provider_post_id, nullif(preview_payload ->> 'provider_post_id', '')),
  provider_published_at = coalesce(provider_published_at, case
    when coalesce(preview_payload ->> 'provider_published_at', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (preview_payload ->> 'provider_published_at')::timestamptz
    else null
  end),
  provider_error_code = coalesce(provider_error_code, nullif(preview_payload ->> 'provider_error_code', '')),
  provider_error_message = coalesce(provider_error_message, nullif(preview_payload ->> 'provider_error_message', ''))
where
  (preview_payload ? 'publish_adapter')
  or (preview_payload ? 'published_via')
  or (preview_payload ? 'provider')
  or (preview_payload ? 'provider_status')
  or (preview_payload ? 'provider_post_id')
  or (preview_payload ? 'provider_published_at')
  or (preview_payload ? 'provider_error_code')
  or (preview_payload ? 'provider_error_message');
