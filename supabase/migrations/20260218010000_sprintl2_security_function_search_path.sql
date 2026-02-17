-- Sprint L2: harden mutable search_path warnings for app helper functions.

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = app, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app.is_firm_member(target_firm uuid)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1
    from public.firm_memberships fm
    where fm.firm_id = target_firm
      and fm.user_id = auth.uid()
  );
$$;

create or replace function app.is_firm_owner(target_firm uuid)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1
    from public.firm_memberships fm
    where fm.firm_id = target_firm
      and fm.user_id = auth.uid()
      and fm.role = 'owner'
  );
$$;

create or replace function app.user_email()
returns text
language sql
stable
set search_path = app, public
as $$
  select lower(coalesce((auth.jwt() ->> 'email'), ''));
$$;
