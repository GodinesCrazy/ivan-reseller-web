ALTER TABLE "user_workflow_configs"
ADD COLUMN "mlPilotModeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mlPilotRequireManualAck" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "mlPilotMaxActivePublications" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "mlProgramVerificationManualOverride" TEXT;
