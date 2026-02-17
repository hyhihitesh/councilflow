-- Sprint L2: set explicit search_path on RLS helper functions.

create or replace function app.is_firm_member(target_firm uuid)
returns boolean
language sql
stable
set search_path = public, app
as $$
  select exists (
    select 1
    from public.firm_memberships fm
    where fm.firm_id = target_firm
      and fm.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_firm_owner(target_firm uuid)
returns boolean
language sql
stable
set search_path = public, app
as $$
  select exists (
    select 1
    from public.firm_memberships fm
    where fm.firm_id = target_firm
      and fm.user_id = (select auth.uid())
      and fm.role = 'owner'
  );
$$;
