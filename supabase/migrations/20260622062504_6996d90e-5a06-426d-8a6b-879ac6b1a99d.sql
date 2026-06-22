
CREATE TABLE public.track_stems (
  track_id uuid PRIMARY KEY REFERENCES public.tracks(id) ON DELETE CASCADE,
  model text NOT NULL DEFAULT 'htdemucs',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
  progress smallint NOT NULL DEFAULT 0,
  event_id text,
  drums_path text,
  bass_path text,
  vocals_path text,
  other_path text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_stems TO authenticated;
GRANT ALL ON public.track_stems TO service_role;
ALTER TABLE public.track_stems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read stems"
  ON public.track_stems FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.owner_id = auth.uid()));
CREATE POLICY "owners write stems"
  ON public.track_stems FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.owner_id = auth.uid()));

CREATE TRIGGER track_stems_set_updated
  BEFORE UPDATE ON public.track_stems
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
