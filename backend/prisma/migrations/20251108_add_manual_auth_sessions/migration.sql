-- CreateTable
CREATE TABLE "manual_auth_sessions" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cookies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "manual_auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_auth_sessions_token_key" ON "manual_auth_sessions"("token");
CREATE INDEX "manual_auth_sessions_userId_provider_status_idx" ON "manual_auth_sessions"("userId", "provider", "status");

-- AddForeignKey
ALTER TABLE "manual_auth_sessions" ADD CONSTRAINT "manual_auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

