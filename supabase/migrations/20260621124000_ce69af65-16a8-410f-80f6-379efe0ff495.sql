
-- tracks bucket: owner-folder isolation
CREATE POLICY "tracks_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tracks' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "tracks_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tracks' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "tracks_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tracks' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "tracks_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tracks' AND auth.uid()::text = (storage.foldername(name))[1]);

-- recordings bucket: same pattern
CREATE POLICY "rec_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "rec_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "rec_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "rec_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- artwork bucket: public read, owner write
CREATE POLICY "artwork_public_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'artwork');
CREATE POLICY "artwork_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'artwork' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "artwork_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'artwork' AND auth.uid()::text = (storage.foldername(name))[1]);

-- soundpack-covers: public read only
CREATE POLICY "spc_public_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'soundpack-covers');
