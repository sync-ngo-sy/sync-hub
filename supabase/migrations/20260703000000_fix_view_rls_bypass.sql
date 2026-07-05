-- 🔴 Critical Security Fix: Views bypass RLS (data leak between tenants)
--
-- Problem:
--   1. candidate_search_rows and candidate_dossier_v1 default to
--      security_definer mode, running as postgres and bypassing RLS.
--   2. Supabase default privileges grant ALL on new tables/views
--      to anon, so even GRANT SELECT ... TO authenticated does not
--      block the public anon key.
--
-- Impact: ANY visitor with the public anon key (embedded in website JS)
-- can query these views and read ALL 1798+ candidates' emails, phones,
-- full CV text (raw_text), parsed profiles (profile_json), timeline,
-- skills, and company history across ALL tenants.
--
-- Fix:
--   1. security_invoker = true → views respect RLS on underlying tables
--   2. REVOKE from anon → defense-in-depth

-- Fix 1: Make views respect RLS on underlying tables
alter view public.candidate_search_rows set (security_invoker = true);
alter view public.candidate_dossier_v1  set (security_invoker = true);

-- Fix 2: Explicitly revoke anon role access
-- (Supabase default privileges grant ALL to anon on new tables/views,
--  so GRANT SELECT ... TO authenticated alone does not block anon.)
revoke all on public.candidate_search_rows from anon;
revoke all on public.candidate_dossier_v1  from anon;
