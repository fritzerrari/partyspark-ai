
CREATE POLICY "stems read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'stems' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "stems insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stems' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "stems update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'stems' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "stems delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'stems' AND (storage.foldername(name))[1] = auth.uid()::text);
