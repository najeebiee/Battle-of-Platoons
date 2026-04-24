-- Battle of Platoons
-- Proposed SQL for the new database/source-data model
--
-- Assumptions:
-- 1. Existing participant identity table is "agents" with primary key "id".
-- 2. "agents.id" is text-compatible. If your real type is uuid, change the FK column types below.
-- 3. Old raw data is archived and not reused in the new flow.
-- 4. Publishable data should be a view derived from raw_data_v2.

begin;

-- ---------------------------------------------------------------------------
-- 1. Product center master table
-- ---------------------------------------------------------------------------

create table if not exists public.product_center_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_type text not null,
  code text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_center_units_unit_type_check
    check (unit_type in ('depot', 'city'))
);

create index if not exists idx_product_center_units_unit_type
  on public.product_center_units(unit_type);

create unique index if not exists ux_product_center_units_unit_type_name
  on public.product_center_units(unit_type, name);

-- Backfill existing depot records into the new unified product-center table.
-- This keeps current admin data usable before city records are introduced.
insert into public.product_center_units (name, unit_type, code, is_active)
select
  d.name,
  'depot',
  d.id,
  true
from public.depots d
where not exists (
  select 1
  from public.product_center_units pcu
  where pcu.unit_type = 'depot'
    and lower(trim(pcu.name)) = lower(trim(d.name))
);

-- Optional helper trigger if you already use a shared updated_at trigger function.
-- Uncomment only if you have the function available.
--
-- create trigger set_product_center_units_updated_at
-- before update on public.product_center_units
-- for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. New raw data table
-- ---------------------------------------------------------------------------

create table if not exists public.raw_data_v2 (
  id uuid primary key default gen_random_uuid(),
  date_real date not null,
  agent_id text not null,

  leads numeric(18,2) not null default 0,
  payins numeric(18,2) not null default 0,
  sales numeric(18,2) not null default 0,
  activation numeric(18,2) not null default 0,

  leads_product_center_unit_id uuid not null,
  sales_product_center_unit_id uuid not null,
  activation_product_center_unit_id uuid not null,

  published boolean not null default false,
  voided boolean not null default false,

  publish_reason text null,
  void_reason text null,
  voided_at timestamptz null,
  voided_by text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text null,
  updated_by text null,

  constraint raw_data_v2_leads_non_negative check (leads >= 0),
  constraint raw_data_v2_payins_non_negative check (payins >= 0),
  constraint raw_data_v2_sales_non_negative check (sales >= 0),
  constraint raw_data_v2_activation_non_negative check (activation >= 0),

  constraint raw_data_v2_agent_fk
    foreign key (agent_id) references public.agents(id),

  constraint raw_data_v2_leads_product_center_unit_fk
    foreign key (leads_product_center_unit_id) references public.product_center_units(id),

  constraint raw_data_v2_sales_product_center_unit_fk
    foreign key (sales_product_center_unit_id) references public.product_center_units(id),

  constraint raw_data_v2_activation_product_center_unit_fk
    foreign key (activation_product_center_unit_id) references public.product_center_units(id)
);

create unique index if not exists ux_raw_data_v2_business_identity
  on public.raw_data_v2 (
    date_real,
    agent_id,
    leads_product_center_unit_id,
    sales_product_center_unit_id,
    activation_product_center_unit_id
  );

create index if not exists idx_raw_data_v2_agent_id
  on public.raw_data_v2(agent_id);

create index if not exists idx_raw_data_v2_date_real
  on public.raw_data_v2(date_real);

create index if not exists idx_raw_data_v2_published
  on public.raw_data_v2(published);

create index if not exists idx_raw_data_v2_voided
  on public.raw_data_v2(voided);

create index if not exists idx_raw_data_v2_pub_void_date
  on public.raw_data_v2(published, voided, date_real);

create index if not exists idx_raw_data_v2_leads_pc_unit
  on public.raw_data_v2(leads_product_center_unit_id);

create index if not exists idx_raw_data_v2_sales_pc_unit
  on public.raw_data_v2(sales_product_center_unit_id);

create index if not exists idx_raw_data_v2_activation_pc_unit
  on public.raw_data_v2(activation_product_center_unit_id);

-- Optional helper trigger if you already use a shared updated_at trigger function.
-- Uncomment only if you have the function available.
--
-- create trigger set_raw_data_v2_updated_at
-- before update on public.raw_data_v2
-- for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. Publishable view
-- ---------------------------------------------------------------------------

drop view if exists public.publishable_raw_data_v2;

create view public.publishable_raw_data_v2 as
select
  r.id,
  r.date_real,
  r.agent_id,
  r.leads,
  r.payins,
  r.sales,
  r.activation,
  r.leads_product_center_unit_id,
  r.sales_product_center_unit_id,
  r.activation_product_center_unit_id,
  r.created_at,
  r.updated_at
from public.raw_data_v2 r
where r.published = true
  and r.voided = false;


-- ---------------------------------------------------------------------------
-- 4. Optional enriched publishable view for easier frontend joins
-- ---------------------------------------------------------------------------

drop view if exists public.publishable_raw_data_v2_enriched;

create view public.publishable_raw_data_v2_enriched as
select
  r.id,
  r.date_real,
  r.agent_id,
  a.name as agent_name,
  a.role as agent_role,
  a.company_id,
  a.platoon_id,
  a.upline_agent_id,
  r.leads,
  r.payins,
  r.sales,
  r.activation,
  r.leads_product_center_unit_id,
  lpcu.name as leads_product_center_unit_name,
  lpcu.unit_type as leads_product_center_unit_type,
  r.sales_product_center_unit_id,
  spcu.name as sales_product_center_unit_name,
  spcu.unit_type as sales_product_center_unit_type,
  r.activation_product_center_unit_id,
  apcu.name as activation_product_center_unit_name,
  apcu.unit_type as activation_product_center_unit_type,
  r.created_at,
  r.updated_at
from public.raw_data_v2 r
join public.agents a
  on a.id = r.agent_id
join public.product_center_units lpcu
  on lpcu.id = r.leads_product_center_unit_id
join public.product_center_units spcu
  on spcu.id = r.sales_product_center_unit_id
join public.product_center_units apcu
  on apcu.id = r.activation_product_center_unit_id
where r.published = true
  and r.voided = false;


-- ---------------------------------------------------------------------------
-- 5. Suggested RLS notes
-- ---------------------------------------------------------------------------
--
-- These are only notes, not enforced below because your existing auth/RLS setup
-- may already have patterns you want to keep.
--
-- Suggested direction:
-- - Enable RLS on raw_data_v2.
-- - Allow admin/super_admin full access.
-- - Allow restricted inserts/updates for user roles if needed.
-- - Expose publishable_raw_data_v2 or publishable_raw_data_v2_enriched for public reads.
--
-- Example:
-- alter table public.raw_data_v2 enable row level security;


-- ---------------------------------------------------------------------------
-- 6. Optional archive rename pattern for old tables
-- ---------------------------------------------------------------------------
--
-- Only run if and when you are ready.
--
-- alter table public.raw_data rename to raw_data_archive;
-- alter view public.publishable_raw_data rename to publishable_raw_data_archive;

commit;
