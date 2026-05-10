


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."audit_raw_data_unpublish"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_reason text;
BEGIN
  -- Only audit when published flips TRUE -> FALSE
  IF COALESCE(OLD.published, false) = true
     AND COALESCE(NEW.published, false) = false THEN

    v_reason := NULLIF(btrim(COALESCE(NEW.publish_reason, '')), '');

    IF v_reason IS NULL THEN
      -- This keeps governance strict and avoids raw_data_audit NULL reason failures
      RAISE EXCEPTION 'UNPUBLISH requires publish_reason';
    END IF;

    INSERT INTO public.raw_data_audit (
      raw_data_id,
      action,
      reason,
      actor_id,
      actor_email,
      created_at,
      performed_by,
      performed_at,
      before,
      after,
      snapshot
    )
    VALUES (
      NEW.id,
      'UNPUBLISH',
      v_reason,
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      now(),
      auth.uid(),
      now(),
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object(
        'date_real', NEW.date_real,
        'agent_id', NEW.agent_id,
        'leads_depot_id', NEW.leads_depot_id,
        'sales_depot_id', NEW.sales_depot_id,
        'published_before', OLD.published,
        'published_after', NEW.published
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_raw_data_unpublish"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_upload_if_week_finalized"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  wk text;
  wk_status text;
begin
  wk := public.week_key_for_date(new.date_real);

  select fw.status
    into wk_status
  from public.finalized_weeks fw
  where fw.week_key = wk;

  if wk_status = 'finalized' then
    raise exception 'Week % is finalized. Uploads are locked.', wk;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."block_upload_if_week_finalized"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."scoring_formulas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "battle_type" "text" NOT NULL,
    "version" integer DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "label" "text" NOT NULL,
    "config" "jsonb" NOT NULL,
    "effective_start_week_key" "text" NOT NULL,
    "effective_end_week_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "published_by" "uuid",
    "last_reason" "text",
    CONSTRAINT "scoring_formulas_battle_type_check" CHECK (("battle_type" = ANY (ARRAY['depots'::"text", 'companies'::"text", 'platoons'::"text", 'squads'::"text", 'commanders'::"text", 'teams'::"text", 'team_leaders'::"text", 'members'::"text"]))),
    CONSTRAINT "scoring_formulas_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."scoring_formulas" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_draft_scoring_formula"("battle_type" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "label" "text", "config" "jsonb", "reason" "text") RETURNS "public"."scoring_formulas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  new_row public.scoring_formulas;
  v_type text := lower(coalesce(battle_type,''));
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  if reason is null or length(trim(reason)) < 3 then
    raise exception 'reason is required';
  end if;

  if v_type not in (
    'depots',
    'companies',
    'platoons',
    'squads',
    'commanders',
    'teams',
    'team_leaders',
    'members'
  ) then
    raise exception 'invalid battle_type';
  end if;

  if effective_end_week_key is not null and effective_end_week_key < effective_start_week_key then
    raise exception 'effective_end_week_key must be >= effective_start_week_key';
  end if;

  perform public.validate_scoring_config(v_type, config);

  insert into public.scoring_formulas (
    battle_type,
    version,
    status,
    label,
    config,
    effective_start_week_key,
    effective_end_week_key,
    created_by,
    updated_by,
    last_reason
  )
  values (
    v_type,
    0,
    'draft',
    label,
    config,
    effective_start_week_key,
    effective_end_week_key,
    auth.uid(),
    auth.uid(),
    reason
  )
  returning * into new_row;

  insert into public.scoring_formula_audit (
    formula_id,
    action,
    actor_id,
    reason,
    before_row,
    after_row
  )
  values (
    new_row.id,
    'create',
    auth.uid(),
    reason,
    null,
    to_jsonb(new_row)
  );

  return new_row;
end;
$$;


ALTER FUNCTION "public"."create_draft_scoring_formula"("battle_type" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "label" "text", "config" "jsonb", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_agent_id"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.agent_id
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."current_user_agent_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_depot_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.role = 'depot_admin' and new.depot_id is null then
    raise exception 'depot_admin must have depot_id';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_depot_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_current_week"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  wk record;
begin
  select * into wk from public.get_custom_week_range(current_date);

  -- only insert if today is within the computed range
  if current_date between wk.start_date and wk.end_date then
    insert into public.finalized_weeks (week_key, start_date, end_date, status)
    values (wk.week_key, wk.start_date, wk.end_date, 'Open')
    on conflict (week_key) do nothing;
  end if;
end;
$$;


ALTER FUNCTION "public"."ensure_current_week"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_week_row"("d" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  anchor date := date '2026-01-05';
  week_num int;
  start_date date;
  end_date date;
  wk text;
begin
  if d < anchor then
    week_num := 1;
    start_date := anchor;
  else
    week_num := floor((d - anchor) / 7) + 1;
    start_date := anchor + (week_num - 1) * 7;
  end if;

  end_date := start_date + 6;
  wk := '2026-W' || lpad(week_num::text, 2, '0');

  insert into public.finalized_weeks (week_key, start_date, end_date, status)
  values (wk, start_date, end_date, 'open')
  on conflict (week_key) do nothing;
end;
$$;


ALTER FUNCTION "public"."ensure_week_row"("d" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_scoring_formula"("battle_type" "text", "week_key" "text") RETURNS TABLE("id" "uuid", "battle_type" "text", "version" integer, "label" "text", "config" "jsonb", "effective_start_week_key" "text", "effective_end_week_key" "text", "published_at" timestamp with time zone, "published_by" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
  with requested as (
    select lower(coalesce(get_active_scoring_formula.battle_type, '')) as battle_type,
           get_active_scoring_formula.week_key as week_key
  ),
  candidate_types as (
    select r.battle_type, 1 as priority
    from requested r

    union all

    select 'teams'::text, 2 as priority
    from requested r
    where r.battle_type in ('members', 'team_leaders')
  )
  select
    f.id,
    f.battle_type,
    f.version,
    f.label,
    f.config,
    f.effective_start_week_key,
    f.effective_end_week_key,
    f.published_at,
    f.published_by
  from public.scoring_formulas f
  join candidate_types ct
    on ct.battle_type = f.battle_type
  join requested r
    on true
  where f.status = 'published'
    and f.effective_start_week_key <= r.week_key
    and (f.effective_end_week_key is null or f.effective_end_week_key >= r.week_key)
  order by ct.priority asc, f.effective_start_week_key desc, f.version desc
  limit 1;
$$;


ALTER FUNCTION "public"."get_active_scoring_formula"("battle_type" "text", "week_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_custom_week_range"("d" "date") RETURNS TABLE("week_key" "text", "start_date" "date", "end_date" "date")
    LANGUAGE "plpgsql"
    AS $$
declare
  anchor date := date '2026-01-05'; -- Week 1 start
  week_num int;
  week_start date;
begin
  if d < anchor then
    -- if before Week 1, just return Week 1
    week_num := 1;
    week_start := anchor;
  else
    week_num := floor((d - anchor) / 7) + 1;
    week_start := anchor + (week_num - 1) * 7;
  end if;

  week_key := format('2026-W%02s', week_num);
  start_date := week_start;
  end_date := week_start + 6;
  return next;
end;
$$;


ALTER FUNCTION "public"."get_custom_week_range"("d" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_publishable_raw_data_for"("user_id" "uuid") RETURNS TABLE("id" "text", "date" "jsonb", "leads" numeric, "payins" numeric, "sales" numeric, "agent_id" "text", "createdAt" "jsonb", "updatedAt" "jsonb", "agentId" "text", "date_real" "date", "voided" boolean, "void_reason" "text", "voided_at" timestamp with time zone, "voided_by" "text", "source" "text", "sales_depot_id" "text", "leads_depot_id" "text", "created_by" "uuid", "published" boolean, "published_at" timestamp with time zone, "published_by" "uuid", "publish_reason" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT id,
         date,
         leads,
         payins,
         sales,
         agent_id,
         "createdAt",
         "updatedAt",
         "agentId",
         date_real,
         voided,
         void_reason,
         voided_at,
         voided_by,
         source,
         sales_depot_id,
         leads_depot_id,
         created_by,
         published,
         published_at,
         published_by,
         publish_reason
    FROM public.raw_data r
   WHERE voided = false
     AND published = true
     AND created_by = user_id;
$$;


ALTER FUNCTION "public"."get_publishable_raw_data_for"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_emails"("user_ids" "uuid"[]) RETURNS TABLE("user_id" "uuid", "email" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select u.id as user_id, u.email
  from auth.users u
  where u.id = any(user_ids);
$$;


ALTER FUNCTION "public"."get_user_emails"("user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_emails_super_admin"("user_ids" "uuid"[]) RETURNS TABLE("user_id" "uuid", "email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select u.id as user_id, u.email
  from auth.users u
  where u.id = any(user_ids);
end;
$$;


ALTER FUNCTION "public"."get_user_emails_super_admin"("user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_emails_super_admin_json"("payload" "jsonb") RETURNS TABLE("user_id" "uuid", "email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  ids uuid[];
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  -- Convert payload.user_ids (array of uuid strings) to uuid[]
  select coalesce(array_agg(x::uuid), '{}'::uuid[])
    into ids
  from jsonb_array_elements_text(payload->'user_ids') as t(x);

  -- IMPORTANT: return columns MUST match (user_id uuid, email text)
  return query
  select
    u.id::uuid  as user_id,
    u.email::text as email
  from auth.users u
  where u.id = any(ids);
end;
$$;


ALTER FUNCTION "public"."get_user_emails_super_admin_json"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_publish_toggle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'UPDATE' then
    if (new.published is distinct from old.published) then
      if not public.is_super_admin() then
        raise exception 'Only super_admin can change published';
      end if;

      if new.published = true then
        new.published_at := now();
        new.published_by := auth.uid();
      else
        new.published_at := null;
        new.published_by := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_publish_toggle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
  );
$$;


ALTER FUNCTION "public"."is_admin_or_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_row_matched"("_agent_id" "text", "_date" "date") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.raw_data c
    join public.raw_data d
      on d.agent_id = c.agent_id
     and d.date_real = c.date_real
     and d.source = 'depot'
     and d.voided = false
    where c.source = 'company'
      and c.voided = false
      and c.agent_id = _agent_id
      and c.date_real = _date
      and coalesce(c.leads, 0)  = coalesce(d.leads, 0)
      and coalesce(c.payins, 0) = coalesce(d.payins, 0)
      and coalesce(c.sales, 0)  = coalesce(d.sales, 0)
  );
$$;


ALTER FUNCTION "public"."is_company_row_matched"("_agent_id" "text", "_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_ph_today_or_yesterday"("p_date" "date") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select p_date between (public.ph_today() - 1) and public.ph_today()
$$;


ALTER FUNCTION "public"."is_ph_today_or_yesterday"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_week_finalized"("d" "date") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.finalized_weeks fw
    where fw.week_key = public.week_key_for_date(d)
      and fw.status = 'finalized'
  );
$$;


ALTER FUNCTION "public"."is_week_finalized"("d" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_week_finalized"("p_week_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists(
    select 1
    from public.finalized_weeks fw
    where fw.week_key = p_week_key
      and fw.status = 'finalized'
  );
$$;


ALTER FUNCTION "public"."is_week_finalized"("p_week_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ph_today"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$
  select (now() at time zone 'Asia/Manila')::date
$$;


ALTER FUNCTION "public"."ph_today"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_scoring_formula"("formula_id" "uuid", "reason" "text") RETURNS "public"."scoring_formulas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  before_row public.scoring_formulas;
  after_row public.scoring_formulas;
  next_version int;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  if reason is null or length(trim(reason)) < 3 then
    raise exception 'reason is required';
  end if;

  select * into before_row
  from public.scoring_formulas
  where id = formula_id;

  if not found then
    raise exception 'formula not found';
  end if;

  if before_row.status <> 'draft' then
    raise exception 'only draft formulas can be published';
  end if;

  if public.is_week_finalized(before_row.effective_start_week_key) then
    raise exception 'cannot publish: effective_start_week_key % is finalized', before_row.effective_start_week_key;
  end if;

  perform public.validate_scoring_config(before_row.battle_type, before_row.config);

  select coalesce(max(f.version), 0) + 1
  into next_version
  from public.scoring_formulas f
  where f.battle_type = before_row.battle_type
    and f.status = 'published';

  update public.scoring_formulas
  set
    status = 'published',
    version = next_version,
    published_at = now(),
    published_by = auth.uid(),
    updated_by = auth.uid(),
    updated_at = now(),
    last_reason = reason
  where id = formula_id
  returning * into after_row;

  insert into public.scoring_formula_audit (
    formula_id,
    action,
    actor_id,
    reason,
    before_row,
    after_row
  )
  values (
    formula_id,
    'publish',
    auth.uid(),
    reason,
    to_jsonb(before_row),
    to_jsonb(after_row)
  );

  return after_row;
end;
$$;


ALTER FUNCTION "public"."publish_scoring_formula"("formula_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_raw_data_created_by"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_raw_data_created_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_agents_case_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v text;
  j jsonb;
begin
  j := to_jsonb(new);

  -- depotId -> depot_id
  v := j->>'depotId';
  if v is not null and (new.depot_id is null or new.depot_id = '') then
    new.depot_id := v;
  end if;

  -- companyId -> company_id
  v := j->>'companyId';
  if v is not null and (new.company_id is null or new.company_id = '') then
    new.company_id := v;
  end if;

  -- platoonId -> platoon_id
  v := j->>'platoonId';
  if v is not null and (new.platoon_id is null or new.platoon_id = '') then
    new.platoon_id := v;
  end if;

  -- photoURL -> photo_url
  v := j->>'photoURL';
  if v is not null and (new.photo_url is null or new.photo_url = '') then
    new.photo_url := v;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_agents_case_columns"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."raw_data" (
    "id" "text" NOT NULL,
    "date" "jsonb" NOT NULL,
    "leads" numeric DEFAULT 0 NOT NULL,
    "payins" numeric DEFAULT 0 NOT NULL,
    "sales" numeric DEFAULT 0 NOT NULL,
    "agent_id" "text" NOT NULL,
    "createdAt" "jsonb",
    "updatedAt" "jsonb",
    "agentId" "text",
    "date_real" "date" NOT NULL,
    "voided" boolean DEFAULT false NOT NULL,
    "void_reason" "text",
    "voided_at" timestamp with time zone,
    "voided_by" "text",
    "source" "text" DEFAULT 'legacy'::"text",
    "sales_depot_id" "text" NOT NULL,
    "leads_depot_id" "text" NOT NULL,
    "created_by" "uuid",
    "published" boolean DEFAULT false NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "publish_reason" "text",
    CONSTRAINT "raw_data_depot_fields_required_chk" CHECK (true),
    CONSTRAINT "raw_data_source_legacy_check" CHECK ((("source" IS NULL) OR ("source" = 'legacy'::"text")))
);


ALTER TABLE "public"."raw_data" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unvoid_raw_data"("p_id" "text", "p_reason" "text") RETURNS "public"."raw_data"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $_$
DECLARE
  v_row public.raw_data;
  v_updated public.raw_data;
  v_reason text;

  has_voided_at boolean;
  has_voided_by boolean;

  update_sql text;
BEGIN
  -- super_admin gate
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'super_admin only';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  -- Lock row and validate state
  SELECT *
    INTO v_row
  FROM public.raw_data
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'raw_data id not found: %', p_id;
  END IF;

  IF COALESCE(v_row.voided, false) = false THEN
    RAISE EXCEPTION 'row is not voided';
  END IF;

  -- Check optional columns existence (safe across schema variations)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='raw_data' AND column_name='voided_at'
  ) INTO has_voided_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='raw_data' AND column_name='voided_by'
  ) INTO has_voided_by;

  -- Build UPDATE dynamically so we don't reference non-existent columns
  update_sql := 'UPDATE public.raw_data SET voided = false, void_reason = NULL';

  IF has_voided_at THEN
    update_sql := update_sql || ', voided_at = NULL';
  END IF;

  IF has_voided_by THEN
    update_sql := update_sql || ', voided_by = NULL';
  END IF;

  update_sql := update_sql || ' WHERE id = $1 RETURNING *';

  EXECUTE update_sql INTO v_updated USING p_id;

  -- Write audit (append-only)
  INSERT INTO public.raw_data_audit (
    raw_data_id,
    action,
    reason,
    performed_by,
    performed_at,
    snapshot
  )
  VALUES (
    p_id,
    'UNVOID',
    v_reason,
    auth.uid(),
    now(),
    jsonb_build_object(
      'date_real', v_row.date_real,
      'agent_id', v_row.agent_id,
      'leads_depot_id', v_row.leads_depot_id,
      'sales_depot_id', v_row.sales_depot_id
    )
  );

  RETURN v_updated;
END;
$_$;


ALTER FUNCTION "public"."unvoid_raw_data"("p_id" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_draft_scoring_formula"("formula_id" "uuid", "config" "jsonb", "label" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "reason" "text") RETURNS "public"."scoring_formulas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  before_row public.scoring_formulas;
  after_row public.scoring_formulas;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  if reason is null or length(trim(reason)) < 3 then
    raise exception 'reason is required';
  end if;

  select * into before_row
  from public.scoring_formulas
  where id = formula_id;

  if not found then
    raise exception 'formula not found';
  end if;

  if before_row.status <> 'draft' then
    raise exception 'only draft formulas can be updated';
  end if;

  if effective_end_week_key is not null and effective_end_week_key < effective_start_week_key then
    raise exception 'effective_end_week_key must be >= effective_start_week_key';
  end if;

  perform public.validate_scoring_config(before_row.battle_type, config);

  update public.scoring_formulas
  set
    config = update_draft_scoring_formula.config,
    label = update_draft_scoring_formula.label,
    effective_start_week_key = update_draft_scoring_formula.effective_start_week_key,
    effective_end_week_key = update_draft_scoring_formula.effective_end_week_key,
    updated_by = auth.uid(),
    updated_at = now(),
    last_reason = update_draft_scoring_formula.reason
  where id = formula_id
  returning * into after_row;

  insert into public.scoring_formula_audit (
    formula_id,
    action,
    actor_id,
    reason,
    before_row,
    after_row
  )
  values (
    formula_id,
    'update',
    auth.uid(),
    reason,
    to_jsonb(before_row),
    to_jsonb(after_row)
  );

  return after_row;
end;
$$;


ALTER FUNCTION "public"."update_draft_scoring_formula"("formula_id" "uuid", "config" "jsonb", "label" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_raw_data_void_reason"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (OLD.voided IS DISTINCT FROM NEW.voided)
     AND (COALESCE(OLD.voided, false) = false)
     AND (COALESCE(NEW.voided, false) = true) THEN

    IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = '' THEN
      RAISE EXCEPTION 'void_reason is required when voiding a row';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_raw_data_void_reason"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_scoring_config"("p_battle_type" "text", "p_config" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_type text := lower(coalesce(p_battle_type, ''));
  has_leads boolean := false;
  has_sales boolean := false;
  has_payins boolean := false;
  has_activation boolean := false;
  metric_count integer := 0;
  total_points numeric := 0;
begin
  if v_type not in (
    'depots',
    'companies',
    'platoons',
    'squads',
    'commanders',
    'teams',
    'team_leaders',
    'members'
  ) then
    raise exception 'Invalid battle_type: %', p_battle_type
      using errcode = '22023';
  end if;

  if p_config is null then
    raise exception 'Config is required'
      using errcode = '22023';
  end if;

  if not (p_config ? 'metrics') or jsonb_typeof(p_config->'metrics') <> 'array' then
    raise exception 'Config must contain a metrics array'
      using errcode = '22023';
  end if;

  select count(*)
  into metric_count
  from jsonb_array_elements(p_config->'metrics') m;

  select exists (
    select 1
    from jsonb_array_elements(p_config->'metrics') m
    where lower(coalesce(m->>'key', m->>'metric', m->>'name', '')) = 'leads'
  ) into has_leads;

  select exists (
    select 1
    from jsonb_array_elements(p_config->'metrics') m
    where lower(coalesce(m->>'key', m->>'metric', m->>'name', '')) = 'sales'
  ) into has_sales;

  select exists (
    select 1
    from jsonb_array_elements(p_config->'metrics') m
    where lower(coalesce(m->>'key', m->>'metric', m->>'name', '')) = 'payins'
  ) into has_payins;

  select exists (
    select 1
    from jsonb_array_elements(p_config->'metrics') m
    where lower(coalesce(m->>'key', m->>'metric', m->>'name', '')) = 'activation'
  ) into has_activation;

  select coalesce(sum(coalesce((m->>'maxPoints')::numeric, (m->>'max_points')::numeric, (m->>'points')::numeric, 0)), 0)
  into total_points
  from jsonb_array_elements(p_config->'metrics') m;

  if exists (
    select 1
    from jsonb_array_elements(p_config->'metrics') m
    where coalesce((m->>'divisor')::numeric, (m->>'division')::numeric, 0) <= 0
  ) then
    raise exception 'All metric divisors must be greater than 0'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_config->'metrics') m
    where coalesce((m->>'maxPoints')::numeric, (m->>'max_points')::numeric, (m->>'points')::numeric, 0) <= 0
  ) then
    raise exception 'All metric max points must be greater than 0'
      using errcode = '22023';
  end if;

  if not has_leads or not has_sales or not has_activation then
    raise exception 'Config must include leads, sales, and activation'
      using errcode = '22023';
  end if;

  if total_points <> 1000 then
    raise exception 'Config total max points must equal 1000'
      using errcode = '22023';
  end if;

  if v_type = 'depots' then
    if has_payins then
      raise exception 'Depots config must NOT include payins'
        using errcode = '22023';
    end if;

    if metric_count <> 3 then
      raise exception 'Depots config must contain exactly 3 metrics'
        using errcode = '22023';
    end if;
  else
    if not has_payins then
      raise exception 'Config must include payins for battle_type %', p_battle_type
        using errcode = '22023';
    end if;

    if metric_count <> 4 then
      raise exception 'Config must contain exactly 4 metrics for battle_type %', p_battle_type
        using errcode = '22023';
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."validate_scoring_config"("p_battle_type" "text", "p_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_unpublish_reason"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only enforce when published flips from true to false
  IF COALESCE(OLD.published, false) = true
     AND COALESCE(NEW.published, false) = false THEN

    IF btrim(COALESCE(NEW.publish_reason, '')) = '' THEN
      RAISE EXCEPTION 'publish_reason is required when unpublishing';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_unpublish_reason"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."week_key_for_date"("d" "date") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  anchor date := date '2026-01-05';
  week_num int;
begin
  if d < anchor then
    week_num := 1;
  else
    week_num := floor((d - anchor) / 7) + 1;
  end if;

  return '2026-W' || lpad(week_num::text, 2, '0');
end;
$$;


ALTER FUNCTION "public"."week_key_for_date"("d" "date") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "photo_url" "text",
    "company_id" "text",
    "platoon_id" "text",
    "photoURL" "text",
    "firestore_id" "text",
    "createdAt" "jsonb",
    "updatedAt" "jsonb",
    "companyId" "text",
    "platoonId" "text",
    "role" "text" DEFAULT 'platoon'::"text" NOT NULL,
    "upline_agent_id" "text",
    "depot_id" "text",
    CONSTRAINT "agents_role_check" CHECK (("role" = ANY (ARRAY['platoon'::"text", 'squad'::"text"])))
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "photo_url" "text",
    "photoURL" "text",
    "firestore_id" "text",
    "createdAt" "jsonb",
    "updatedAt" "jsonb"
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."depots" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "photo_url" "text",
    "photoURL" "text",
    "firestore_id" "text",
    "createdAt" "jsonb",
    "updatedAt" "jsonb"
);


ALTER TABLE "public"."depots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finalized_weeks" (
    "id" bigint NOT NULL,
    "week_key" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "finalized_at" timestamp with time zone,
    "finalized_by" "uuid",
    "finalize_reason" "text",
    "reopened_at" timestamp with time zone,
    "reopened_by" "uuid",
    "reopen_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finalized_weeks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'finalized'::"text"]))),
    CONSTRAINT "week_key_format_check" CHECK (("week_key" ~ '^2026-W[0-9]{2}$'::"text"))
);


ALTER TABLE "public"."finalized_weeks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."finalized_weeks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."finalized_weeks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."finalized_weeks_id_seq" OWNED BY "public"."finalized_weeks"."id";



CREATE TABLE IF NOT EXISTS "public"."platoons" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "photo_url" "text",
    "photoURL" "text",
    "firestore_id" "text",
    "createdAt" "jsonb",
    "updatedAt" "jsonb"
);


ALTER TABLE "public"."platoons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_center_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "unit_type" "text" NOT NULL,
    "code" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_center_units_unit_type_check" CHECK (("unit_type" = ANY (ARRAY['depot'::"text", 'city'::"text"])))
);


ALTER TABLE "public"."product_center_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "depot_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_id" "text",
    "login_email" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'user'::"text"]))),
    CONSTRAINT "profiles_user_role_requires_agent_id_chk" CHECK (((COALESCE("role", ''::"text") <> 'user'::"text") OR ("agent_id" IS NOT NULL)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_scoring_formulas_v" WITH ("security_invoker"='on') AS
 SELECT "id",
    "battle_type",
    "version",
    "label",
    "config",
    "effective_start_week_key",
    "effective_end_week_key",
    "published_at",
    "published_by"
   FROM "public"."scoring_formulas" "f"
  WHERE ("status" = 'published'::"text");


ALTER VIEW "public"."public_scoring_formulas_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."publishable_raw_data" AS
 SELECT "id",
    "date",
    "leads",
    "payins",
    "sales",
    "agent_id",
    "createdAt",
    "updatedAt",
    "agentId",
    "date_real",
    "voided",
    "void_reason",
    "voided_at",
    "voided_by",
    "source",
    "sales_depot_id",
    "leads_depot_id",
    "created_by",
    "published",
    "published_at",
    "published_by",
    "publish_reason"
   FROM "public"."raw_data"
  WHERE ("published" = true);


ALTER VIEW "public"."publishable_raw_data" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."publishable_raw_data_public" AS
 SELECT "id",
    "date",
    "leads",
    "payins",
    "sales",
    "agent_id",
    "createdAt",
    "updatedAt",
    "agentId",
    "date_real",
    "voided",
    "void_reason",
    "voided_at",
    "voided_by",
    "source",
    "sales_depot_id",
    "leads_depot_id",
    "created_by",
    "published",
    "published_at",
    "published_by",
    "publish_reason"
   FROM "public"."raw_data"
  WHERE (("published" = true) AND (COALESCE("voided", false) = false));


ALTER VIEW "public"."publishable_raw_data_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."raw_data_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date_real" "date" NOT NULL,
    "agent_id" "text" NOT NULL,
    "leads" numeric(18,2) DEFAULT 0 NOT NULL,
    "payins" numeric(18,2) DEFAULT 0 NOT NULL,
    "sales" numeric(18,2) DEFAULT 0 NOT NULL,
    "activation" numeric(18,2) DEFAULT 0 NOT NULL,
    "leads_product_center_unit_id" "uuid" NOT NULL,
    "sales_product_center_unit_id" "uuid" NOT NULL,
    "activation_product_center_unit_id" "uuid" NOT NULL,
    "published" boolean DEFAULT false NOT NULL,
    "voided" boolean DEFAULT false NOT NULL,
    "publish_reason" "text",
    "void_reason" "text",
    "voided_at" timestamp with time zone,
    "voided_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text",
    "updated_by" "text",
    CONSTRAINT "raw_data_v2_activation_non_negative" CHECK (("activation" >= (0)::numeric)),
    CONSTRAINT "raw_data_v2_leads_non_negative" CHECK (("leads" >= (0)::numeric)),
    CONSTRAINT "raw_data_v2_payins_non_negative" CHECK (("payins" >= (0)::numeric)),
    CONSTRAINT "raw_data_v2_sales_non_negative" CHECK (("sales" >= (0)::numeric))
);


ALTER TABLE "public"."raw_data_v2" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."publishable_raw_data_v2" AS
 SELECT "id",
    "date_real",
    "agent_id",
    "leads",
    "payins",
    "sales",
    "activation",
    "leads_product_center_unit_id",
    "sales_product_center_unit_id",
    "activation_product_center_unit_id",
    "created_at",
    "updated_at"
   FROM "public"."raw_data_v2" "r"
  WHERE (("published" = true) AND ("voided" = false));


ALTER VIEW "public"."publishable_raw_data_v2" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."publishable_raw_data_v2_enriched" AS
 SELECT "r"."id",
    "r"."date_real",
    "r"."agent_id",
    "a"."name" AS "agent_name",
    "a"."role" AS "agent_role",
    "a"."company_id",
    "a"."platoon_id",
    "a"."upline_agent_id",
    "r"."leads",
    "r"."payins",
    "r"."sales",
    "r"."activation",
    "r"."leads_product_center_unit_id",
    "lpcu"."name" AS "leads_product_center_unit_name",
    "lpcu"."unit_type" AS "leads_product_center_unit_type",
    "r"."sales_product_center_unit_id",
    "spcu"."name" AS "sales_product_center_unit_name",
    "spcu"."unit_type" AS "sales_product_center_unit_type",
    "r"."activation_product_center_unit_id",
    "apcu"."name" AS "activation_product_center_unit_name",
    "apcu"."unit_type" AS "activation_product_center_unit_type",
    "r"."created_at",
    "r"."updated_at"
   FROM (((("public"."raw_data_v2" "r"
     JOIN "public"."agents" "a" ON (("a"."id" = "r"."agent_id")))
     JOIN "public"."product_center_units" "lpcu" ON (("lpcu"."id" = "r"."leads_product_center_unit_id")))
     JOIN "public"."product_center_units" "spcu" ON (("spcu"."id" = "r"."sales_product_center_unit_id")))
     JOIN "public"."product_center_units" "apcu" ON (("apcu"."id" = "r"."activation_product_center_unit_id")))
  WHERE (("r"."published" = true) AND ("r"."voided" = false));


ALTER VIEW "public"."publishable_raw_data_v2_enriched" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."raw_data_audit" (
    "id" bigint NOT NULL,
    "raw_data_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "actor_id" "text",
    "actor_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "before" "jsonb",
    "after" "jsonb",
    "performed_by" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"(),
    "snapshot" "jsonb",
    CONSTRAINT "raw_data_audit_action_check" CHECK (("action" = ANY (ARRAY['VOID'::"text", 'UNPUBLISH'::"text", 'UNVOID'::"text"])))
);


ALTER TABLE "public"."raw_data_audit" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."raw_data_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."raw_data_audit_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."raw_data_audit_id_seq" OWNED BY "public"."raw_data_audit"."id";



CREATE TABLE IF NOT EXISTS "public"."scoring_formula_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "formula_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "reason" "text" NOT NULL,
    "before_row" "jsonb",
    "after_row" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scoring_formula_audit_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text", 'publish'::"text"])))
);


ALTER TABLE "public"."scoring_formula_audit" OWNER TO "postgres";


ALTER TABLE ONLY "public"."finalized_weeks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."finalized_weeks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."raw_data_audit" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."raw_data_audit_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."depots"
    ADD CONSTRAINT "depots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finalized_weeks"
    ADD CONSTRAINT "finalized_weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finalized_weeks"
    ADD CONSTRAINT "finalized_weeks_week_key_key" UNIQUE ("week_key");



ALTER TABLE ONLY "public"."platoons"
    ADD CONSTRAINT "platoons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_center_units"
    ADD CONSTRAINT "product_center_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."raw_data_audit"
    ADD CONSTRAINT "raw_data_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."raw_data"
    ADD CONSTRAINT "raw_data_id_unique" UNIQUE ("id");



ALTER TABLE ONLY "public"."raw_data"
    ADD CONSTRAINT "raw_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."raw_data_v2"
    ADD CONSTRAINT "raw_data_v2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_formula_audit"
    ADD CONSTRAINT "scoring_formula_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_formulas"
    ADD CONSTRAINT "scoring_formulas_pkey" PRIMARY KEY ("id");



CREATE INDEX "agents_company_id_idx" ON "public"."agents" USING "btree" ("company_id");



CREATE INDEX "agents_depot_id_idx" ON "public"."agents" USING "btree" ("depot_id");



CREATE INDEX "agents_name_idx" ON "public"."agents" USING "btree" ("name");



CREATE INDEX "agents_platoon_id_idx" ON "public"."agents" USING "btree" ("platoon_id");



CREATE INDEX "agents_role_idx" ON "public"."agents" USING "btree" ("role");



CREATE INDEX "idx_agents_upline_agent_id" ON "public"."agents" USING "btree" ("upline_agent_id");



CREATE INDEX "idx_finalized_weeks_range" ON "public"."finalized_weeks" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_finalized_weeks_status" ON "public"."finalized_weeks" USING "btree" ("status");



CREATE INDEX "idx_product_center_units_unit_type" ON "public"."product_center_units" USING "btree" ("unit_type");



CREATE INDEX "idx_profiles_agent_id" ON "public"."profiles" USING "btree" ("agent_id");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_raw_data_agent_date" ON "public"."raw_data" USING "btree" ("agent_id", "date_real");



CREATE INDEX "idx_raw_data_v2_activation_pc_unit" ON "public"."raw_data_v2" USING "btree" ("activation_product_center_unit_id");



CREATE INDEX "idx_raw_data_v2_agent_id" ON "public"."raw_data_v2" USING "btree" ("agent_id");



CREATE INDEX "idx_raw_data_v2_date_real" ON "public"."raw_data_v2" USING "btree" ("date_real");



CREATE INDEX "idx_raw_data_v2_leads_pc_unit" ON "public"."raw_data_v2" USING "btree" ("leads_product_center_unit_id");



CREATE INDEX "idx_raw_data_v2_pub_void_date" ON "public"."raw_data_v2" USING "btree" ("published", "voided", "date_real");



CREATE INDEX "idx_raw_data_v2_published" ON "public"."raw_data_v2" USING "btree" ("published");



CREATE INDEX "idx_raw_data_v2_sales_pc_unit" ON "public"."raw_data_v2" USING "btree" ("sales_product_center_unit_id");



CREATE INDEX "idx_raw_data_v2_voided" ON "public"."raw_data_v2" USING "btree" ("voided");



CREATE INDEX "idx_scoring_formula_audit_formula" ON "public"."scoring_formula_audit" USING "btree" ("formula_id", "created_at" DESC);



CREATE INDEX "idx_scoring_formulas_battle_status" ON "public"."scoring_formulas" USING "btree" ("battle_type", "status");



CREATE INDEX "idx_scoring_formulas_effective" ON "public"."scoring_formulas" USING "btree" ("battle_type", "effective_start_week_key", "effective_end_week_key");



CREATE INDEX "idx_scoring_formulas_version" ON "public"."scoring_formulas" USING "btree" ("battle_type", "version" DESC);



CREATE INDEX "profiles_depot_idx" ON "public"."profiles" USING "btree" ("depot_id");



CREATE INDEX "profiles_role_idx" ON "public"."profiles" USING "btree" ("role");



CREATE UNIQUE INDEX "profiles_user_id_unique" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "raw_data_agent_id_idx" ON "public"."raw_data" USING "btree" ("agent_id");



CREATE INDEX "raw_data_audit_created_at_idx" ON "public"."raw_data_audit" USING "btree" ("created_at" DESC);



CREATE INDEX "raw_data_audit_raw_data_id_idx" ON "public"."raw_data_audit" USING "btree" ("raw_data_id");



CREATE INDEX "raw_data_date_real_idx" ON "public"."raw_data" USING "btree" ("date_real");



CREATE INDEX "raw_data_depot_id_idx" ON "public"."raw_data" USING "btree" ("sales_depot_id");



CREATE INDEX "raw_data_leads_depot_id_idx" ON "public"."raw_data" USING "btree" ("leads_depot_id");



CREATE INDEX "raw_data_published_idx" ON "public"."raw_data" USING "btree" ("published");



CREATE UNIQUE INDEX "raw_data_unique_quad" ON "public"."raw_data" USING "btree" ("date_real", "agent_id", "leads_depot_id", "sales_depot_id");



CREATE INDEX "raw_data_voided_idx" ON "public"."raw_data" USING "btree" ("voided");



CREATE UNIQUE INDEX "ux_product_center_units_unit_type_name" ON "public"."product_center_units" USING "btree" ("unit_type", "name");



CREATE UNIQUE INDEX "ux_raw_data_v2_business_identity" ON "public"."raw_data_v2" USING "btree" ("date_real", "agent_id", "leads_product_center_unit_id", "sales_product_center_unit_id", "activation_product_center_unit_id");



CREATE OR REPLACE TRIGGER "trg_audit_raw_data_unpublish" AFTER UPDATE OF "published" ON "public"."raw_data" FOR EACH ROW EXECUTE FUNCTION "public"."audit_raw_data_unpublish"();



CREATE OR REPLACE TRIGGER "trg_block_upload_finalized" BEFORE INSERT OR UPDATE ON "public"."raw_data" FOR EACH ROW EXECUTE FUNCTION "public"."block_upload_if_week_finalized"();



CREATE OR REPLACE TRIGGER "trg_handle_publish_toggle" BEFORE UPDATE ON "public"."raw_data" FOR EACH ROW EXECUTE FUNCTION "public"."handle_publish_toggle"();



CREATE OR REPLACE TRIGGER "trg_profiles_depot_admin" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_depot_admin"();



CREATE OR REPLACE TRIGGER "trg_scoring_formulas_updated_at" BEFORE UPDATE ON "public"."scoring_formulas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_raw_data_created_by" BEFORE INSERT ON "public"."raw_data" FOR EACH ROW EXECUTE FUNCTION "public"."set_raw_data_created_by"();



CREATE OR REPLACE TRIGGER "trg_sync_agents_case_columns" BEFORE INSERT OR UPDATE ON "public"."agents" FOR EACH ROW EXECUTE FUNCTION "public"."sync_agents_case_columns"();



CREATE OR REPLACE TRIGGER "trg_validate_unpublish_reason" BEFORE UPDATE ON "public"."raw_data" FOR EACH ROW EXECUTE FUNCTION "public"."validate_unpublish_reason"();



CREATE OR REPLACE TRIGGER "trg_validate_void_reason" BEFORE UPDATE ON "public"."raw_data" FOR EACH ROW EXECUTE FUNCTION "public"."validate_raw_data_void_reason"();



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_platoon_id_fkey" FOREIGN KEY ("platoon_id") REFERENCES "public"."platoons"("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_upline_agent_id_fkey" FOREIGN KEY ("upline_agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_depot_id_fkey" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."raw_data"
    ADD CONSTRAINT "raw_data_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."raw_data"
    ADD CONSTRAINT "raw_data_depot_id_fkey" FOREIGN KEY ("sales_depot_id") REFERENCES "public"."depots"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."raw_data"
    ADD CONSTRAINT "raw_data_leads_depot_fkey" FOREIGN KEY ("leads_depot_id") REFERENCES "public"."depots"("id");



ALTER TABLE ONLY "public"."raw_data"
    ADD CONSTRAINT "raw_data_leads_depot_id_fkey" FOREIGN KEY ("leads_depot_id") REFERENCES "public"."depots"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."raw_data"
    ADD CONSTRAINT "raw_data_sales_depot_fkey" FOREIGN KEY ("sales_depot_id") REFERENCES "public"."depots"("id");



ALTER TABLE ONLY "public"."raw_data_v2"
    ADD CONSTRAINT "raw_data_v2_activation_product_center_unit_fk" FOREIGN KEY ("activation_product_center_unit_id") REFERENCES "public"."product_center_units"("id");



ALTER TABLE ONLY "public"."raw_data_v2"
    ADD CONSTRAINT "raw_data_v2_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."raw_data_v2"
    ADD CONSTRAINT "raw_data_v2_leads_product_center_unit_fk" FOREIGN KEY ("leads_product_center_unit_id") REFERENCES "public"."product_center_units"("id");



ALTER TABLE ONLY "public"."raw_data_v2"
    ADD CONSTRAINT "raw_data_v2_sales_product_center_unit_fk" FOREIGN KEY ("sales_product_center_unit_id") REFERENCES "public"."product_center_units"("id");



ALTER TABLE ONLY "public"."scoring_formula_audit"
    ADD CONSTRAINT "scoring_formula_audit_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "public"."scoring_formulas"("id") ON DELETE RESTRICT;



ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agents_select_admin_or_super" ON "public"."agents" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_super_admin"());



CREATE POLICY "agents_select_anon" ON "public"."agents" FOR SELECT TO "anon" USING (true);



CREATE POLICY "agents_select_self_or_admin" ON "public"."agents" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND (("p"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])) OR ("p"."agent_id" = "agents"."id"))))));



CREATE POLICY "agents_write_super_only" ON "public"."agents" TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "auth_read_companies" ON "public"."companies" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth_read_depots" ON "public"."depots" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth_read_platoons" ON "public"."platoons" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_insert_super_admin" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



CREATE POLICY "companies_update_super_admin" ON "public"."companies" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."depots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "depots_insert_super_admin" ON "public"."depots" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



CREATE POLICY "depots_update_super_admin" ON "public"."depots" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."finalized_weeks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finalized_weeks_super_only" ON "public"."finalized_weeks" TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."platoons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platoons_insert_super_admin" ON "public"."platoons" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



CREATE POLICY "platoons_update_super_admin" ON "public"."platoons" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."role" = 'super_admin'::"text")))));



ALTER TABLE "public"."product_center_units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_center_units_select_anon" ON "public"."product_center_units" FOR SELECT TO "anon" USING (true);



CREATE POLICY "product_center_units_select_authenticated" ON "public"."product_center_units" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_read_own" ON "public"."profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_read_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_super_admin_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "public_read_companies" ON "public"."companies" FOR SELECT TO "anon" USING (true);



CREATE POLICY "public_read_depots" ON "public"."depots" FOR SELECT TO "anon" USING (true);



CREATE POLICY "public_read_platoons" ON "public"."platoons" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."raw_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."raw_data_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "raw_data_audit_insert_admin_or_super" ON "public"."raw_data_audit" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin_or_super_admin"() AND ("actor_id" = ("auth"."uid"())::"text")));



CREATE POLICY "raw_data_audit_no_client_writes" ON "public"."raw_data_audit" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "raw_data_audit_select_super_only" ON "public"."raw_data_audit" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_super_admin"());



CREATE POLICY "raw_data_insert_admin_or_super" ON "public"."raw_data" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin_or_super_admin"() OR (("public"."current_user_role"() = 'user'::"text") AND ("agent_id" = "public"."current_user_agent_id"()) AND "public"."is_ph_today_or_yesterday"("date_real"))));



CREATE POLICY "raw_data_no_delete" ON "public"."raw_data" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "raw_data_restrict_delete_scope" ON "public"."raw_data" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "raw_data_restrict_insert_scope" ON "public"."raw_data" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin_user"() OR (("public"."current_user_role"() = 'user'::"text") AND ("agent_id" = "public"."current_user_agent_id"()) AND "public"."is_ph_today_or_yesterday"("date_real"))));



CREATE POLICY "raw_data_restrict_select_scope" ON "public"."raw_data" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("public"."is_admin_user"() OR (("public"."current_user_role"() = 'user'::"text") AND ("agent_id" = "public"."current_user_agent_id"()))));



CREATE POLICY "raw_data_restrict_update_scope" ON "public"."raw_data" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (("public"."is_admin_user"() OR (("public"."current_user_role"() = 'user'::"text") AND ("agent_id" = "public"."current_user_agent_id"()) AND "public"."is_ph_today_or_yesterday"("date_real")))) WITH CHECK (("public"."is_admin_user"() OR (("public"."current_user_role"() = 'user'::"text") AND ("agent_id" = "public"."current_user_agent_id"()) AND "public"."is_ph_today_or_yesterday"("date_real"))));



CREATE POLICY "raw_data_select_admin_or_super" ON "public"."raw_data" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_super_admin"() OR (("public"."current_user_role"() = 'user'::"text") AND ("agent_id" = "public"."current_user_agent_id"()))));



CREATE POLICY "raw_data_update_admin_or_super" ON "public"."raw_data" FOR UPDATE TO "authenticated" USING (("public"."is_admin_or_super_admin"() OR (("public"."current_user_role"() = 'user'::"text") AND ("agent_id" = "public"."current_user_agent_id"()) AND "public"."is_ph_today_or_yesterday"("date_real")))) WITH CHECK (("public"."is_admin_or_super_admin"() OR (("public"."current_user_role"() = 'user'::"text") AND ("agent_id" = "public"."current_user_agent_id"()) AND "public"."is_ph_today_or_yesterday"("date_real"))));



ALTER TABLE "public"."raw_data_v2" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_formula_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scoring_formula_audit_no_client_writes" ON "public"."scoring_formula_audit" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "scoring_formula_audit_select_super_only" ON "public"."scoring_formula_audit" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



ALTER TABLE "public"."scoring_formulas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scoring_formulas_select_admin_or_super" ON "public"."scoring_formulas" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_super_admin"());



CREATE POLICY "scoring_formulas_select_anon_published" ON "public"."scoring_formulas" FOR SELECT TO "anon" USING (("status" = 'published'::"text"));



CREATE POLICY "scoring_formulas_write_super_only" ON "public"."scoring_formulas" TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."audit_raw_data_unpublish"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_raw_data_unpublish"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_raw_data_unpublish"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_upload_if_week_finalized"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_upload_if_week_finalized"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_upload_if_week_finalized"() TO "service_role";



GRANT ALL ON TABLE "public"."scoring_formulas" TO "anon";
GRANT ALL ON TABLE "public"."scoring_formulas" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_formulas" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_draft_scoring_formula"("battle_type" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "label" "text", "config" "jsonb", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_draft_scoring_formula"("battle_type" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "label" "text", "config" "jsonb", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_draft_scoring_formula"("battle_type" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "label" "text", "config" "jsonb", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_agent_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_agent_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_agent_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_depot_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_depot_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_depot_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_current_week"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_current_week"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_current_week"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_week_row"("d" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_week_row"("d" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_week_row"("d" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_scoring_formula"("battle_type" "text", "week_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_scoring_formula"("battle_type" "text", "week_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_scoring_formula"("battle_type" "text", "week_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_custom_week_range"("d" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_custom_week_range"("d" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_custom_week_range"("d" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_publishable_raw_data_for"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_publishable_raw_data_for"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_publishable_raw_data_for"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_publishable_raw_data_for"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_emails"("user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_emails"("user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_emails"("user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_emails"("user_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_emails_super_admin"("user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_emails_super_admin"("user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_emails_super_admin"("user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_emails_super_admin"("user_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_emails_super_admin_json"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_emails_super_admin_json"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_emails_super_admin_json"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_emails_super_admin_json"("payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_publish_toggle"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_publish_toggle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_publish_toggle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_company_row_matched"("_agent_id" "text", "_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."is_company_row_matched"("_agent_id" "text", "_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_row_matched"("_agent_id" "text", "_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_ph_today_or_yesterday"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."is_ph_today_or_yesterday"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_ph_today_or_yesterday"("p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_week_finalized"("d" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."is_week_finalized"("d" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_week_finalized"("d" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_week_finalized"("p_week_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_week_finalized"("p_week_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_week_finalized"("p_week_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ph_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."ph_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ph_today"() TO "service_role";



GRANT ALL ON FUNCTION "public"."publish_scoring_formula"("formula_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."publish_scoring_formula"("formula_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_scoring_formula"("formula_id" "uuid", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_raw_data_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_raw_data_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_raw_data_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_agents_case_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_agents_case_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_agents_case_columns"() TO "service_role";



GRANT ALL ON TABLE "public"."raw_data" TO "authenticated";
GRANT ALL ON TABLE "public"."raw_data" TO "service_role";



GRANT ALL ON FUNCTION "public"."unvoid_raw_data"("p_id" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unvoid_raw_data"("p_id" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unvoid_raw_data"("p_id" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_draft_scoring_formula"("formula_id" "uuid", "config" "jsonb", "label" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_draft_scoring_formula"("formula_id" "uuid", "config" "jsonb", "label" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_draft_scoring_formula"("formula_id" "uuid", "config" "jsonb", "label" "text", "effective_start_week_key" "text", "effective_end_week_key" "text", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_raw_data_void_reason"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_raw_data_void_reason"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_raw_data_void_reason"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_scoring_config"("p_battle_type" "text", "p_config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_scoring_config"("p_battle_type" "text", "p_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_scoring_config"("p_battle_type" "text", "p_config" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_unpublish_reason"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_unpublish_reason"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_unpublish_reason"() TO "service_role";



GRANT ALL ON FUNCTION "public"."week_key_for_date"("d" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."week_key_for_date"("d" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."week_key_for_date"("d" "date") TO "service_role";


















GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."depots" TO "anon";
GRANT ALL ON TABLE "public"."depots" TO "authenticated";
GRANT ALL ON TABLE "public"."depots" TO "service_role";



GRANT ALL ON TABLE "public"."finalized_weeks" TO "anon";
GRANT ALL ON TABLE "public"."finalized_weeks" TO "authenticated";
GRANT ALL ON TABLE "public"."finalized_weeks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."finalized_weeks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."finalized_weeks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."finalized_weeks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."platoons" TO "anon";
GRANT ALL ON TABLE "public"."platoons" TO "authenticated";
GRANT ALL ON TABLE "public"."platoons" TO "service_role";



GRANT ALL ON TABLE "public"."product_center_units" TO "anon";
GRANT ALL ON TABLE "public"."product_center_units" TO "authenticated";
GRANT ALL ON TABLE "public"."product_center_units" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."public_scoring_formulas_v" TO "anon";
GRANT ALL ON TABLE "public"."public_scoring_formulas_v" TO "authenticated";
GRANT ALL ON TABLE "public"."public_scoring_formulas_v" TO "service_role";



GRANT ALL ON TABLE "public"."publishable_raw_data" TO "anon";
GRANT ALL ON TABLE "public"."publishable_raw_data" TO "authenticated";
GRANT ALL ON TABLE "public"."publishable_raw_data" TO "service_role";



GRANT ALL ON TABLE "public"."publishable_raw_data_public" TO "anon";
GRANT ALL ON TABLE "public"."publishable_raw_data_public" TO "authenticated";
GRANT ALL ON TABLE "public"."publishable_raw_data_public" TO "service_role";



GRANT ALL ON TABLE "public"."raw_data_v2" TO "anon";
GRANT ALL ON TABLE "public"."raw_data_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."raw_data_v2" TO "service_role";



GRANT ALL ON TABLE "public"."publishable_raw_data_v2" TO "anon";
GRANT ALL ON TABLE "public"."publishable_raw_data_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."publishable_raw_data_v2" TO "service_role";



GRANT ALL ON TABLE "public"."publishable_raw_data_v2_enriched" TO "anon";
GRANT ALL ON TABLE "public"."publishable_raw_data_v2_enriched" TO "authenticated";
GRANT ALL ON TABLE "public"."publishable_raw_data_v2_enriched" TO "service_role";



GRANT ALL ON TABLE "public"."raw_data_audit" TO "anon";
GRANT ALL ON TABLE "public"."raw_data_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."raw_data_audit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."raw_data_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."raw_data_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."raw_data_audit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_formula_audit" TO "anon";
GRANT ALL ON TABLE "public"."scoring_formula_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_formula_audit" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































