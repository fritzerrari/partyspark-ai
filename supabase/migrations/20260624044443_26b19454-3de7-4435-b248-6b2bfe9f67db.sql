
-- 1) set_plans
CREATE TABLE public.set_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_type text NOT NULL,
  duration_min int NOT NULL,
  peak_at_min int,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.set_plans TO authenticated;
GRANT ALL ON public.set_plans TO service_role;
ALTER TABLE public.set_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "set_plans_owner_all" ON public.set_plans
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER set_plans_updated_at
  BEFORE UPDATE ON public.set_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX set_plans_owner_idx ON public.set_plans(owner_id, updated_at DESC);

-- 2) tracks: embedding + smart_crate + user_tags
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS embedding jsonb,
  ADD COLUMN IF NOT EXISTS smart_crate text,
  ADD COLUMN IF NOT EXISTS user_tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS tracks_smart_crate_idx ON public.tracks(owner_id, smart_crate);
