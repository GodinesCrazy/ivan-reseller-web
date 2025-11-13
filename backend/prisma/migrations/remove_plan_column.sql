-- Migration: Remove plan column from users table
-- This migration removes the 'plan' column if it exists

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'plan'
    ) THEN
        ALTER TABLE users DROP COLUMN plan;
        RAISE NOTICE 'Column plan removed from users table';
    ELSE
        RAISE NOTICE 'Column plan does not exist, skipping removal';
    END IF;
END $$;

