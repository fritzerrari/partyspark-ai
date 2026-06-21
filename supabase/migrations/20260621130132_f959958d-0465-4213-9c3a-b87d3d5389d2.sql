
-- =============================================
-- Community Sound-FX Marketplace
-- =============================================

-- FX category enum
CREATE TYPE public.fx_category AS ENUM (
  'drop', 'riser', 'airhorn', 'sweep', 'voice', 'impact', 'transition', 'loop', 'other'
);

CREATE TYPE public.fx_status AS ENUM ('pending', 'approved', 'rejected');

-- =============================================
-- community_fx
-- =============================================
CREATE TABLE public.community_fx (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category public.fx_category NOT NULL DEFAULT 'other',
  tags TEXT[] NOT NULL DEFAULT '{}',
  duration_s NUMERIC(6,2) NOT NULL,
  bpm INTEGER,
  storage_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/ogg',
  status public.fx_status NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  play_count BIGINT NOT NULL DEFAULT 0,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_fx_status ON public.community_fx(status);
CREATE INDEX idx_community_fx_uploader ON public.community_fx(uploader_id);
CREATE INDEX idx_community_fx_category ON public.community_fx(category);
CREATE INDEX idx_community_fx_hash ON public.community_fx(file_hash);
CREATE INDEX idx_community_fx_created ON public.community_fx(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_fx TO authenticated;
GRANT ALL ON public.community_fx TO service_role;

ALTER TABLE public.community_fx ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view approved fx"
  ON public.community_fx FOR SELECT TO authenticated
  USING (status = 'approved' OR uploader_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can upload fx"
  ON public.community_fx FOR INSERT TO authenticated
  WITH CHECK (uploader_id = auth.uid() AND status = 'pending');

CREATE POLICY "Uploader can update own pending fx"
  ON public.community_fx FOR UPDATE TO authenticated
  USING (uploader_id = auth.uid() AND status = 'pending')
  WITH CHECK (uploader_id = auth.uid());

CREATE POLICY "Admins can update any fx"
  ON public.community_fx FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Uploader or admin can delete fx"
  ON public.community_fx FOR DELETE TO authenticated
  USING (uploader_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_community_fx_updated_at
  BEFORE UPDATE ON public.community_fx
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- community_fx_ratings
-- =============================================
CREATE TABLE public.community_fx_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fx_id UUID NOT NULL REFERENCES public.community_fx(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fx_id, user_id)
);

CREATE INDEX idx_fx_ratings_fx ON public.community_fx_ratings(fx_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_fx_ratings TO authenticated;
GRANT ALL ON public.community_fx_ratings TO service_role;

ALTER TABLE public.community_fx_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view ratings"
  ON public.community_fx_ratings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can rate as themselves"
  ON public.community_fx_ratings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own ratings"
  ON public.community_fx_ratings FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own ratings"
  ON public.community_fx_ratings FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_fx_ratings_updated_at
  BEFORE UPDATE ON public.community_fx_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- community_fx_plays
-- =============================================
CREATE TABLE public.community_fx_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fx_id UUID NOT NULL REFERENCES public.community_fx(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fx_plays_fx ON public.community_fx_plays(fx_id);
CREATE INDEX idx_fx_plays_played_at ON public.community_fx_plays(played_at DESC);

GRANT SELECT, INSERT ON public.community_fx_plays TO authenticated;
GRANT ALL ON public.community_fx_plays TO service_role;

ALTER TABLE public.community_fx_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can log own plays"
  ON public.community_fx_plays FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own plays, admins all"
  ON public.community_fx_plays FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =============================================
-- community_fx_reports
-- =============================================
CREATE TABLE public.community_fx_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fx_id UUID NOT NULL REFERENCES public.community_fx(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fx_reports_status ON public.community_fx_reports(status);

GRANT SELECT, INSERT, UPDATE ON public.community_fx_reports TO authenticated;
GRANT ALL ON public.community_fx_reports TO service_role;

ALTER TABLE public.community_fx_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can report"
  ON public.community_fx_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Reporter or admin can view"
  ON public.community_fx_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update reports"
  ON public.community_fx_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- storage_quotas
-- =============================================
CREATE TABLE public.storage_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fx_bytes_used BIGINT NOT NULL DEFAULT 0,
  tracks_bytes_used BIGINT NOT NULL DEFAULT 0,
  recordings_bytes_used BIGINT NOT NULL DEFAULT 0,
  fx_quota_bytes BIGINT NOT NULL DEFAULT 52428800,        -- 50 MB
  tracks_quota_bytes BIGINT NOT NULL DEFAULT 209715200,   -- 200 MB
  recordings_quota_bytes BIGINT NOT NULL DEFAULT 104857600, -- 100 MB
  tier TEXT NOT NULL DEFAULT 'free',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.storage_quotas TO authenticated;
GRANT ALL ON public.storage_quotas TO service_role;

ALTER TABLE public.storage_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quota; admins all"
  ON public.storage_quotas FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can upsert own quota row"
  ON public.storage_quotas FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own quota; admins any"
  ON public.storage_quotas FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_quotas_updated_at
  BEFORE UPDATE ON public.storage_quotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create quota row for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.storage_quotas (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_on_auth_user_created_quota
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_quota();

-- Backfill quotas for existing users
INSERT INTO public.storage_quotas (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- =============================================
-- tracks: cleanup signals
-- =============================================
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS last_played_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleanup_warned_at TIMESTAMPTZ;

-- =============================================
-- Wilson Score + Trending View
-- =============================================
CREATE OR REPLACE VIEW public.community_fx_rankings AS
WITH agg AS (
  SELECT
    f.id AS fx_id,
    COALESCE(AVG(r.stars)::NUMERIC, 0) AS avg_stars,
    COUNT(r.id)::INTEGER AS rating_count,
    -- Wilson lower bound on normalised (avg_stars/5) with z=1.96
    CASE WHEN COUNT(r.id) = 0 THEN 0
    ELSE (
      ((AVG(r.stars)/5.0) + (1.96*1.96)/(2*COUNT(r.id))
       - 1.96 * SQRT(((AVG(r.stars)/5.0)*(1 - AVG(r.stars)/5.0) + (1.96*1.96)/(4*COUNT(r.id))) / COUNT(r.id))
      ) / (1 + (1.96*1.96)/COUNT(r.id))
    ) END AS wilson_score,
    (SELECT COUNT(*) FROM public.community_fx_plays p
       WHERE p.fx_id = f.id AND p.played_at > now() - INTERVAL '7 days') AS plays_7d
  FROM public.community_fx f
  LEFT JOIN public.community_fx_ratings r ON r.fx_id = f.id
  WHERE f.status = 'approved'
  GROUP BY f.id
)
SELECT
  fx_id,
  ROUND(avg_stars, 2) AS avg_stars,
  rating_count,
  ROUND(wilson_score::NUMERIC, 4) AS wilson_score,
  plays_7d,
  ROUND((wilson_score * 0.7 + LEAST(plays_7d, 100) / 100.0 * 0.3)::NUMERIC, 4) AS trending_score
FROM agg;

GRANT SELECT ON public.community_fx_rankings TO authenticated;
GRANT SELECT ON public.community_fx_rankings TO service_role;

-- =============================================
-- Helper RPC: refresh play_count and play tracking on plays
-- =============================================
CREATE OR REPLACE FUNCTION public.on_fx_play()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_fx SET play_count = play_count + 1 WHERE id = NEW.fx_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_fx_play_count
  AFTER INSERT ON public.community_fx_plays
  FOR EACH ROW EXECUTE FUNCTION public.on_fx_play();

-- =============================================
-- Update last_played_at on track plays (via track_queue updates)
-- We track via a function callable from server fn instead of triggers,
-- since plays happen client-side. Add a helper RPC:
-- =============================================
CREATE OR REPLACE FUNCTION public.mark_track_played(_track_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tracks
  SET last_played_at = now(), cleanup_warned_at = NULL
  WHERE id = _track_id AND user_id = auth.uid();
END $$;

GRANT EXECUTE ON FUNCTION public.mark_track_played(UUID) TO authenticated;

-- =============================================
-- Bootstrap admin role for fritz.geiling@googlemail.com
-- =============================================
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'fritz.geiling@googlemail.com';
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
