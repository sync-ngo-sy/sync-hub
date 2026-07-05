-- Automated CI Security Test Script
-- This script simulates various roles querying the database to ensure tenant isolation and correct access levels.
-- If any test fails, it raises an exception to fail the CI build.

DO $$
DECLARE
  test_tenant_id uuid := 'b2f56708-30de-441c-b26a-85d7b5c77726';
  victim_tenant_id uuid := '22222222-2222-2222-2222-222222222222';
  test_user_id uuid;
  victim_user_id uuid;
  platform_admin_id uuid;
  v_count integer;
  v_error text;
BEGIN
  -- Setup test users if they don't exist
  SELECT id INTO test_user_id FROM auth.users WHERE email = 'test_user@example.com';
  IF test_user_id IS NULL THEN
    test_user_id := gen_random_uuid();
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (test_user_id, 'test_user@example.com', '{"name": "Test User"}');
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status) VALUES (test_tenant_id, test_user_id, 'recruiter', 'active');
  END IF;

  SELECT id INTO platform_admin_id FROM auth.users WHERE email = 'admin@test.com';
  IF platform_admin_id IS NULL THEN
    platform_admin_id := gen_random_uuid();
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (platform_admin_id, 'admin@test.com', '{"name": "Admin"}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = platform_admin_id) THEN
    INSERT INTO public.platform_admins (user_id) VALUES (platform_admin_id);
  END IF;

  RAISE NOTICE '--- RUNNING SECURITY TESTS ---';

  -------------------------------------------------------------------
  -- SCENARIO 1: ANON ROLE
  -------------------------------------------------------------------
  RAISE NOTICE 'Testing Anon Role...';
  SET LOCAL ROLE anon;

  -- 1a. View: Should fail with permission denied
  BEGIN
    SELECT count(*) INTO v_count FROM public.candidate_search_rows;
    RAISE EXCEPTION 'ANON TEST FAILED: anon can read candidate_search_rows!';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected
  END;

  -- 1b. RPC with NULL: Should fail
  BEGIN
    PERFORM * FROM public.ingestion_capacity_snapshot_v1(NULL);
    RAISE EXCEPTION 'ANON TEST FAILED: anon can execute RPC!';
  EXCEPTION
    WHEN insufficient_privilege THEN
      -- Expected if execute is revoked
    WHEN raise_exception THEN
      -- Expected if execute is allowed but internal validation fails
  END;

  -------------------------------------------------------------------
  -- SCENARIO 2: TEST USER (Authenticated, Belongs to Test Tenant)
  -------------------------------------------------------------------
  RESET ROLE;
  RAISE NOTICE 'Testing Authenticated User Role...';
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', test_user_id), true);
  SET LOCAL ROLE authenticated;

  -- 2a. View: Should return candidates (no crash)
  SELECT count(*) INTO v_count FROM public.candidate_search_rows;

  -- 2b. RPC with NULL: Should fail (tenant_id required)
  BEGIN
    PERFORM * FROM public.ingestion_capacity_snapshot_v1(NULL);
    RAISE EXCEPTION 'AUTH TEST FAILED: normal user can bypass tenant check!';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error != 'tenant_id is required' THEN
      RAISE EXCEPTION 'AUTH TEST FAILED: unexpected error %', v_error;
    END IF;
  END;

  -- 2c. RPC with Victim Tenant ID (IDOR attempt): Should fail
  BEGIN
    PERFORM * FROM public.ingestion_capacity_snapshot_v1('22222222-2222-2222-2222-222222222222');
    RAISE EXCEPTION 'AUTH TEST FAILED: normal user can access other tenant (IDOR)!';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error != 'Access denied: not a member of this tenant' THEN
      RAISE EXCEPTION 'AUTH TEST FAILED: unexpected error %', v_error;
    END IF;
  END;

  -------------------------------------------------------------------
  -- SCENARIO 3: PLATFORM ADMIN
  -------------------------------------------------------------------
  RESET ROLE;
  RAISE NOTICE 'Testing Platform Admin Role...';
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', platform_admin_id), true);
  SET LOCAL ROLE authenticated;

  -- 3a. RPC with Victim Tenant ID: Should succeed (platform admins have bypass)
  PERFORM * FROM public.ingestion_capacity_snapshot_v1('22222222-2222-2222-2222-222222222222');

  -------------------------------------------------------------------
  -- SCENARIO 4: SERVICE ROLE
  -------------------------------------------------------------------
  RESET ROLE;
  RAISE NOTICE 'Testing Service Role...';
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  SET LOCAL ROLE service_role;

  -- 4a. View: Should succeed
  SELECT count(*) INTO v_count FROM public.candidate_search_rows;

  -- 4b. RPC with NULL: Should succeed (service role can query all tenants)
  PERFORM * FROM public.ingestion_capacity_snapshot_v1(NULL);

  RAISE NOTICE '--- ALL SECURITY TESTS PASSED ---';
END $$;
