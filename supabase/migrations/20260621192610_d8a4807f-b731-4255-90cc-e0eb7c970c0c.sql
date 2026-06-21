-- Add audio analysis columns to tracks for BPM/Key/Beat-Grid/Energy/Vocal-Map
ALTER TABLE public.tracks
  ALTER COLUMN bpm TYPE real USING bpm::real,
  ADD COLUMN IF NOT EXISTS beat_grid jsonb,
  ADD COLUMN IF NOT EXISTS energy_curve jsonb,
  ADD COLUMN IF NOT EXISTS cues jsonb,
  ADD COLUMN IF NOT EXISTS vocal_map jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;
