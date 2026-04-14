-- FASE 3E.3: confirmación / pago CJ post-createOrder
ALTER TABLE "cj_ebay_orders" ADD COLUMN "cjConfirmedAt" TIMESTAMP(3),
ADD COLUMN "cjPaidAt" TIMESTAMP(3);

ALTER TABLE "cj_ebay_account_settings" ADD COLUMN "cjPostCreateCheckoutMode" TEXT NOT NULL DEFAULT 'MANUAL';
