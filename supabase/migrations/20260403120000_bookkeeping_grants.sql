-- Grant authenticated role access to bookkeeping_connections
-- (service_role was granted in 20260402 but authenticated was missed)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookkeeping_connections TO authenticated;
