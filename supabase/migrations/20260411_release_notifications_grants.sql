-- Grant write privileges to authenticated so RLS policies can take effect
GRANT INSERT, UPDATE, DELETE ON public.release_notifications TO authenticated;
