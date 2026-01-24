-- ================================================================
-- Supabase migration for tight governance on public.raw_data
-- ================================================================
-- Adds approval columns, expands audit actions, introduces helper
-- functions, and recreates RLS to ensure only publishable rows are
-- exposed publicly while keeping scoped access for admins.
-- ================================================================

-- 1) Columns ------------------------------------------------------
alter table public.raw_data
  add column if not exists approved boolean not null default false,
  add column if not exists approved_by uuid null,
  add column if not exists approved_at timestamptz null,
  add column if not exists approve_reason text null,
  add column if not exists week_key text null;

-- 2) Indexes ------------------------------------------------------
create index if not exists idx_raw_data_date_real on public.raw_data (date_real);
create index if not exists idx_raw_data_agent_id on public.raw_data (agent_id);
create index if not exists idx_raw_data_source on public.raw_data (source);
create index if not exists idx_raw_data_approved on public.raw_data (approved);
create index if not exists idx_raw_data_date_agent_source on public.raw_data (date_real, agent_id, source);

-- 3) Audit action constraint --------------------------------------
alter table public.raw_data_audit drop constraint if exists raw_data_audit_action_check;
alter table public.raw_data_audit
  add constraint raw_data_audit_action_check
  check (action in ('edit', 'void', 'unvoid', 'approve', 'unapprove'));

-- 4) Helper functions --------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin'
  );
$$;

create or replace function public.is_raw_data_matched(p_date date, p_agent_id text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_company record;
  v_depot record;
begin
  select leads, payins, sales
  into v_company
  from public.raw_data
  where date_real = p_date
    and agent_id = p_agent_id
    and source = 'company'
    and voided = false
  limit 1;

  select leads, payins, sales
  into v_depot
  from public.raw_data
  where date_real = p_date
    and agent_id = p_agent_id
    and source = 'depot'
    and voided = false
  limit 1;

  if v_company is null or v_depot is null then
    return false;
  end if;

  return
    coalesce(v_company.leads, 0) = coalesce(v_depot.leads, 0)
    and coalesce(v_company.payins, 0) = coalesce(v_depot.payins, 0)
    and coalesce(v_company.sales, 0) = coalesce(v_depot.sales, 0);
end;
$$;

create or replace function public.is_raw_data_publishable(r public.raw_data)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(r.approved, false)
         or public.is_raw_data_matched(r.date_real, r.agent_id);
$$;

create or replace function public.is_raw_data_visible_to_user(r public.raw_data)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  -- Admins see everything
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    );
$$;

create or replace function public.enforce_raw_data_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_super_admin() then
    return new;
  end if;

  if (new.approved is distinct from old.approved)
     or (new.approved_by is distinct from old.approved_by)
     or (new.approved_at is distinct from old.approved_at)
     or (new.approve_reason is distinct from old.approve_reason) then
    raise exception 'Only super_admin can modify approval fields';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_raw_data_approval_guard on public.raw_data;
create trigger trg_raw_data_approval_guard
before update on public.raw_data
for each row execute function public.enforce_raw_data_approval_guard();

-- 5) RLS policies --------------------------------------------------
alter table public.raw_data enable row level security;

-- Clean up permissive policies
drop policy if exists raw_data_read_auth on public.raw_data;
drop policy if exists raw_data_update_auth on public.raw_data;
drop policy if exists "raw_data read auth" on public.raw_data;
drop policy if exists "raw_data update auth" on public.raw_data;
drop policy if exists "Enable read access for all authenticated users" on public.raw_data;
drop policy if exists "Enable update for all authenticated users" on public.raw_data;
drop policy if exists "Allow public to read raw_data" on public.raw_data;

-- Public/anon can only see publishable, non-voided company rows
drop policy if exists raw_data_select_public_publishable on public.raw_data;
create policy raw_data_select_public_publishable
  on public.raw_data
  for select
  to anon
  using (
    source = 'company'
    and voided = false
    and public.is_raw_data_publishable(raw_data)
  );

-- Scoped select for authenticated users
drop policy if exists raw_data_select_authenticated_scoped on public.raw_data;
create policy raw_data_select_authenticated_scoped
  on public.raw_data
  for select
  to authenticated
  using (public.is_raw_data_visible_to_user(raw_data));

-- Scoped updates for admins with guard on approval fields
drop policy if exists raw_data_update_scoped on public.raw_data;
create policy raw_data_update_scoped
  on public.raw_data
  for update
  to authenticated
  using (public.is_raw_data_visible_to_user(raw_data))
  with check (public.is_raw_data_visible_to_user(raw_data));

-- Explicit approval policy for super admins
drop policy if exists raw_data_update_super_admin on public.raw_data;
create policy raw_data_update_super_admin
  on public.raw_data
  for update
  to authenticated
  using (public.is_super_admin())
  with check (true);

-- Optional: maintain existing insert/delete policies if present; none added here.
