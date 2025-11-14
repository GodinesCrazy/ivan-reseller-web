-- Add metadata column to manual_auth_sessions table
ALTER TABLE "manual_auth_sessions" ADD COLUMN IF NOT EXISTS "metadata" TEXT;

