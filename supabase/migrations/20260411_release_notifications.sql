-- ── release_notifications table ──────────────────────────────────────────────
CREATE TABLE public.release_notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  description   text        NOT NULL,
  category      text        NOT NULL,
  discover_link text        NOT NULL,
  image_url     text,
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.release_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.release_notifications TO authenticated;
GRANT ALL    ON public.release_notifications TO service_role;

-- All authenticated users can read
CREATE POLICY "anyone_select_release_notifications"
  ON public.release_notifications FOR SELECT
  TO authenticated
  USING (true);

-- Only the admin email can write
CREATE POLICY "admin_insert_release_notifications"
  ON public.release_notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.email() = 'milo.cosemans@gmail.com');

CREATE POLICY "admin_update_release_notifications"
  ON public.release_notifications FOR UPDATE
  TO authenticated
  USING  (auth.email() = 'milo.cosemans@gmail.com')
  WITH CHECK (auth.email() = 'milo.cosemans@gmail.com');

CREATE POLICY "admin_delete_release_notifications"
  ON public.release_notifications FOR DELETE
  TO authenticated
  USING (auth.email() = 'milo.cosemans@gmail.com');

-- ── Supabase Storage bucket ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('notification-images', 'notification-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admin to upload
CREATE POLICY "admin_upload_notification_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'notification-images'
    AND auth.email() = 'milo.cosemans@gmail.com'
  );

-- Allow admin to update (upsert) existing objects
CREATE POLICY "admin_update_notification_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'notification-images'
    AND auth.email() = 'milo.cosemans@gmail.com'
  )
  WITH CHECK (
    bucket_id = 'notification-images'
    AND auth.email() = 'milo.cosemans@gmail.com'
  );

-- Allow admin to delete
CREATE POLICY "admin_delete_notification_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'notification-images'
    AND auth.email() = 'milo.cosemans@gmail.com'
  );

-- Public read for the bucket objects
CREATE POLICY "public_read_notification_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notification-images');
