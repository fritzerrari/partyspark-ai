CREATE TABLE public.recording_moments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_sec NUMERIC NOT NULL,
  end_sec NUMERIC NOT NULL,
  kind TEXT NOT NULL,
  caption TEXT,
  score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recording_moments_recording ON public.recording_moments(recording_id);
CREATE INDEX idx_recording_moments_owner ON public.recording_moments(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recording_moments TO authenticated;
GRANT ALL ON public.recording_moments TO service_role;

ALTER TABLE public.recording_moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own moments" ON public.recording_moments
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.party_host_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  vibe TEXT NOT NULL DEFAULT 'hype',
  language TEXT NOT NULL DEFAULT 'de',
  voice TEXT NOT NULL DEFAULT 'alloy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_party_host_lines_user ON public.party_host_lines(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_host_lines TO authenticated;
GRANT ALL ON public.party_host_lines TO service_role;

ALTER TABLE public.party_host_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own host lines" ON public.party_host_lines
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);