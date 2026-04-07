ALTER TABLE "user_workflow_configs"
ADD COLUMN "mlChannelMode" TEXT NOT NULL DEFAULT 'local_only',
ADD COLUMN "mlForeignSellerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mlInternationalPublishingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mlReturnAddressConfigured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mlShippingOriginCountry" TEXT,
ADD COLUMN "mlSellerOriginCountry" TEXT;
