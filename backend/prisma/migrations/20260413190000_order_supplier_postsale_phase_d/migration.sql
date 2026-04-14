-- Phase D: generic supplier post-sale fields on internal Order.
ALTER TABLE "orders"
  ADD COLUMN "supplier" TEXT,
  ADD COLUMN "supplierOrderId" TEXT,
  ADD COLUMN "supplierStatus" TEXT,
  ADD COLUMN "supplierPaymentStatus" TEXT,
  ADD COLUMN "supplierTrackingNumber" TEXT,
  ADD COLUMN "supplierTrackingUrl" TEXT,
  ADD COLUMN "supplierLogisticName" TEXT,
  ADD COLUMN "supplierSyncAt" TIMESTAMP(3),
  ADD COLUMN "supplierMetadata" JSONB;

CREATE INDEX "orders_supplier_supplierStatus_idx" ON "orders"("supplier", "supplierStatus");
CREATE INDEX "orders_supplierOrderId_idx" ON "orders"("supplierOrderId");
