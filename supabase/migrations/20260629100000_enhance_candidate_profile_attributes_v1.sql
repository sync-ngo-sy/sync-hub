-- SCRUM11: Enhance Candidate Profile Attributes
-- Adds structured recruiter-facing profile fields to candidate_profiles

-- =========================
-- 1. CORE PROFILE ATTRIBUTES
-- =========================

alter table candidate_profiles
add column if not exists status text;

alter table candidate_profiles
add column if not exists job_readiness_level text default 'L1';

alter table candidate_profiles
add column if not exists preferred_work_mode text;

alter table candidate_profiles
add column if not exists years_of_experience numeric;

alter table candidate_profiles
add column if not exists primary_skills text[] default '{}';

alter table candidate_profiles
add column if not exists notice_period text;

alter table candidate_profiles
add column if not exists english_proficiency text;

alter table candidate_profiles
add column if not exists expected_salary jsonb;

alter table candidate_profiles
add column if not exists is_pre_screened boolean default false;

alter table candidate_profiles
add column if not exists sync_affiliation text;

alter table candidate_profiles
add column if not exists internal_vetting_notes text;

alter table candidate_profiles
add column if not exists current_location_city text;

alter table candidate_profiles
add column if not exists willingness_to_relocate boolean;

alter table candidate_profiles
add column if not exists external_profiles jsonb;

alter table candidate_profiles
add column if not exists ai_profile_summary text;

alter table candidate_profiles
add column if not exists employment_type_preference text[] default '{}';

alter table candidate_profiles
add column if not exists last_interaction_date timestamptz;


-- =========================
-- 2. CONSTRAINTS (VALIDATION)
-- =========================

-- Job readiness level enum constraint
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidate_profiles_job_readiness_level_check'
  ) then
    alter table candidate_profiles
    add constraint candidate_profiles_job_readiness_level_check
    check (job_readiness_level in ('L1','L2','L3','L4','L5'));
  end if;
end $$;


-- Years of experience must be non-negative
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidate_profiles_years_experience_check'
  ) then
    alter table candidate_profiles
    add constraint candidate_profiles_years_experience_check
    check (years_of_experience is null or years_of_experience >= 0);
  end if;
end $$;


-- =========================
-- 3. INDEXES (SEARCH OPTIMIZATION)
-- =========================

create index if not exists idx_candidate_profiles_status
on candidate_profiles(status);

create index if not exists idx_candidate_profiles_readiness
on candidate_profiles(job_readiness_level);

create index if not exists idx_candidate_profiles_location
on candidate_profiles(current_location_city);

create index if not exists idx_candidate_profiles_experience
on candidate_profiles(years_of_experience);

-- GIN index for array search (skills)
create index if not exists idx_candidate_profiles_skills
on candidate_profiles using gin(primary_skills);

create index if not exists idx_candidate_profiles_employment_type
on candidate_profiles using gin(employment_type_preference);


-- =========================
-- 4. DEFAULT NORMALIZATION (SAFETY)
-- =========================

-- Ensure existing null readiness becomes L1
update candidate_profiles
set job_readiness_level = 'L1'
where job_readiness_level is null;


-- =========================
-- 5. JSON STRUCTURE SAFETY NOTES
-- =========================
-- expected_salary format:
-- { "amount": number, "currency": "USD" }
--
-- external_profiles format:
-- { "linkedin": "...", "github": "...", "portfolio": "..." }
