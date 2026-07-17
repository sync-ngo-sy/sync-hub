GRANT SELECT, INSERT, UPDATE ON public.tenants TO service_role;
GRANT SELECT, UPDATE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_memberships TO service_role, authenticated;
