-- Create table for tracking marketplace auth health
CREATE TABLE "marketplace_auth_status" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "message" TEXT,
    "requires_manual" BOOLEAN NOT NULL DEFAULT FALSE,
    "last_automatic_attempt" TIMESTAMP(3),
    "last_automatic_success" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketplace_auth_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "marketplace_auth_status_user_id_marketplace_key" ON "marketplace_auth_status"("user_id", "marketplace");
CREATE INDEX "marketplace_auth_status_marketplace_status_idx" ON "marketplace_auth_status"("marketplace", "status");

