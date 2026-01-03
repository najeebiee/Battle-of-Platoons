-- ================================================================
-- Agents upline + role expansion
-- Safe, idempotent migration for Supabase
-- ================================================================

-- A) Add upline column (nullable) ---------------------------------
alter table if exists public.agents
  add column if not exists upline_agent_id text;

-- B) Add FK with ON DELETE SET NULL (only if missing) -------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agents_upline_agent_id_fkey'
      AND conrelid = 'public.agents'::regclass
  ) THEN
    ALTER TABLE public.agents
      ADD CONSTRAINT agents_upline_agent_id_fkey
      FOREIGN KEY (upline_agent_id)
      REFERENCES public.agents(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- C) Index for joins ----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_agents_upline_agent_id
  ON public.agents (upline_agent_id);

-- D) Extend role check constraint to include "team" ---------------
DO $$
DECLARE
  constraint_name text;
  constraint_def text;
BEGIN
  SELECT conname, pg_get_constraintdef(oid)
    INTO constraint_name, constraint_def
  FROM pg_constraint pc
  JOIN pg_class c ON pc.conrelid = c.oid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'agents'
    AND pc.contype = 'c'
    AND pg_get_constraintdef(pc.oid) ILIKE '%role%';

  -- If constraint already allows team, keep it
  IF constraint_def ILIKE '%team%' THEN
    RETURN;
  END IF;

  -- Drop old constraint (name-safe)
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agents DROP CONSTRAINT %I', constraint_name);
  END IF;

  -- Recreate with expanded roles (handle duplicate in case it already exists)
  BEGIN
    ALTER TABLE public.agents
      ADD CONSTRAINT agents_role_check
      CHECK (role IN ('platoon', 'squad', 'team'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
