-- CreateEnum
CREATE TYPE "CredentialScope" AS ENUM ('user', 'global');

-- DropIndex
DROP INDEX IF EXISTS "api_credentials_userId_apiName_environment_key";

-- AlterTable
ALTER TABLE "api_credentials"
    ADD COLUMN "scope" "CredentialScope" NOT NULL DEFAULT 'user',
    ADD COLUMN "sharedById" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "api_credentials_userId_apiName_environment_scope_key"
    ON "api_credentials"("userId", "apiName", "environment", "scope");

-- AddForeignKey
ALTER TABLE "api_credentials"
    ADD CONSTRAINT "api_credentials_sharedById_fkey"
    FOREIGN KEY ("sharedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

