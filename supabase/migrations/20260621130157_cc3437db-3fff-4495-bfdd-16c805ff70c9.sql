
-- Upload: User uploads only into their own folder: {user_id}/...
CREATE POLICY "fx_upload_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-fx'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read own files or admin
CREATE POLICY "fx_read_own_or_admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-fx'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- Delete own or admin
CREATE POLICY "fx_delete_own_or_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-fx'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- Update own
CREATE POLICY "fx_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'community-fx'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
