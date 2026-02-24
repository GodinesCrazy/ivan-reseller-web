-- AlterTable: add userId to orders for automatic Sale creation after fulfillment
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

CREATE INDEX IF NOT EXISTS "orders_userId_idx" ON "orders"("userId");

ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
