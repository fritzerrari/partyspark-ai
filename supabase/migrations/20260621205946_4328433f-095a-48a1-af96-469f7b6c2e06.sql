ALTER TABLE public.loops
  ADD COLUMN IF NOT EXISTS bpm numeric,
  ADD COLUMN IF NOT EXISTS bars numeric,
  ADD COLUMN IF NOT EXISTS peaks jsonb,
  ADD COLUMN IF NOT EXISTS duration_sec numeric;