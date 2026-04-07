ALTER TABLE "user_workflow_configs"
ADD COLUMN "mlReturnPolicyConfigured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mlPostSaleContactConfigured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mlResponseSlaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mlAlertsConfigured" BOOLEAN NOT NULL DEFAULT false;
