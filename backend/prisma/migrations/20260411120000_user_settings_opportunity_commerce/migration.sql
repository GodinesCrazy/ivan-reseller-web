-- Oportunidades: tamaños permitidos + envío China-USA por defecto por usuario
-- IF NOT EXISTS: compatible con ejecución manual previa (scripts) y reintentos de migrate.
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "opportunityAllowedPackageTiers" TEXT NOT NULL DEFAULT 'small';
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "opportunitySmallMaxPriceUsd" DECIMAL(10,2) NOT NULL DEFAULT 45;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "opportunityMediumMaxPriceUsd" DECIMAL(10,2) NOT NULL DEFAULT 120;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "defaultChinaUsShippingUsd" DECIMAL(10,2) NOT NULL DEFAULT 5.99;
