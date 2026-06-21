
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS master_output_id text,
  ADD COLUMN IF NOT EXISTS cue_output_id text,
  ADD COLUMN IF NOT EXISTS mic_device_id text,
  ADD COLUMN IF NOT EXISTS mic_gain real NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS mic_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mic_ducking boolean NOT NULL DEFAULT false;
