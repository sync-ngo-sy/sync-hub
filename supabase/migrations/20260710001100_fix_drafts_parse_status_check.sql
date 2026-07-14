DO $$
DECLARE
    existing_constraint_name text;
BEGIN
    -- Find the auto-generated or existing CHECK constraint on the parse_status column
    SELECT conname INTO existing_constraint_name
    FROM pg_constraint
    JOIN pg_class ON conrelid = pg_class.oid
    JOIN pg_attribute ON attrelid = pg_class.oid AND attnum = ANY(conkey)
    WHERE pg_class.relname = 'candidate_registration_drafts'
      AND pg_attribute.attname = 'parse_status'
      AND contype = 'c'
    LIMIT 1;

    -- Drop it if it exists
    IF existing_constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.candidate_registration_drafts DROP CONSTRAINT ' || quote_ident(existing_constraint_name);
    END IF;
END $$;

-- Add the new constraint including 'published'
ALTER TABLE public.candidate_registration_drafts
ADD CONSTRAINT candidate_registration_drafts_parse_status_check
CHECK (parse_status IN ('pending', 'parsing', 'completed', 'failed', 'pending_validation', 'published'));
