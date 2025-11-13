-- Migration: Add plan column to users table
-- This migration adds the 'plan' column to the users table if it doesn't exist

-- Check if column exists before adding it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'plan'
    ) THEN
        ALTER TABLE users 
        ADD COLUMN plan VARCHAR(20) DEFAULT 'FREE' NOT NULL;
        
        -- Update existing users based on their role
        UPDATE users 
        SET plan = 'ADMIN' 
        WHERE role = 'ADMIN' AND plan = 'FREE';
        
        -- Add comment to column
        COMMENT ON COLUMN users.plan IS 'User plan: FREE, BASIC, PRO, ENTERPRISE, ADMIN';
    END IF;
END $$;

