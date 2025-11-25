-- ✅ MIGRACIÓN MANUAL: Auditoría de Monedas - Decimal y Campos Currency
-- Fecha: 2025-01-27
-- Descripción: Cambiar Float → Decimal para campos monetarios y agregar campos currency

-- ⚠️ IMPORTANTE: Esta migración debe ejecutarse en orden y puede requerir downtime
-- ⚠️ BACKUP: Hacer backup de la base de datos antes de ejecutar

BEGIN;

-- ============================================
-- 1. AGREGAR CAMPOS CURRENCY (NUEVOS)
-- ============================================

-- Agregar currency a Product
ALTER TABLE "products" 
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

-- Agregar currency a Sale
ALTER TABLE "sales" 
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

-- Agregar currency a Commission
ALTER TABLE "commissions" 
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

-- Agregar currency a AdminCommission
ALTER TABLE "admin_commissions" 
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

-- ============================================
-- 2. CAMBIAR FLOAT → DECIMAL (MIGRACIÓN DE TIPO)
-- ============================================

-- User: balance y totalEarnings
ALTER TABLE "users" 
ALTER COLUMN "balance" TYPE DECIMAL(18, 2) USING "balance"::DECIMAL(18, 2),
ALTER COLUMN "totalEarnings" TYPE DECIMAL(18, 2) USING "totalEarnings"::DECIMAL(18, 2),
ALTER COLUMN "fixedMonthlyCost" TYPE DECIMAL(18, 2) USING "fixedMonthlyCost"::DECIMAL(18, 2);

-- Product: precios
ALTER TABLE "products" 
ALTER COLUMN "aliexpressPrice" TYPE DECIMAL(18, 2) USING "aliexpressPrice"::DECIMAL(18, 2),
ALTER COLUMN "suggestedPrice" TYPE DECIMAL(18, 2) USING "suggestedPrice"::DECIMAL(18, 2),
ALTER COLUMN "finalPrice" TYPE DECIMAL(18, 2) USING "finalPrice"::DECIMAL(18, 2);

-- Sale: todos los campos monetarios
ALTER TABLE "sales" 
ALTER COLUMN "salePrice" TYPE DECIMAL(18, 2) USING "salePrice"::DECIMAL(18, 2),
ALTER COLUMN "aliexpressCost" TYPE DECIMAL(18, 2) USING "aliexpressCost"::DECIMAL(18, 2),
ALTER COLUMN "marketplaceFee" TYPE DECIMAL(18, 2) USING "marketplaceFee"::DECIMAL(18, 2),
ALTER COLUMN "grossProfit" TYPE DECIMAL(18, 2) USING "grossProfit"::DECIMAL(18, 2),
ALTER COLUMN "commissionAmount" TYPE DECIMAL(18, 2) USING "commissionAmount"::DECIMAL(18, 2),
ALTER COLUMN "netProfit" TYPE DECIMAL(18, 2) USING "netProfit"::DECIMAL(18, 2);

-- Commission: amount
ALTER TABLE "commissions" 
ALTER COLUMN "amount" TYPE DECIMAL(18, 2) USING "amount"::DECIMAL(18, 2);

-- AdminCommission: amount
ALTER TABLE "admin_commissions" 
ALTER COLUMN "amount" TYPE DECIMAL(18, 2) USING "amount"::DECIMAL(18, 2);

-- SuccessfulOperation: totalProfit y expectedProfit
ALTER TABLE "successful_operations" 
ALTER COLUMN "totalProfit" TYPE DECIMAL(18, 2) USING "totalProfit"::DECIMAL(18, 2),
ALTER COLUMN "expectedProfit" TYPE DECIMAL(18, 2) USING "expectedProfit"::DECIMAL(18, 2);

-- UserWorkflowConfig: workingCapital y maxAutoInvestment
ALTER TABLE "user_workflow_configs" 
ALTER COLUMN "workingCapital" TYPE DECIMAL(18, 2) USING "workingCapital"::DECIMAL(18, 2),
ALTER COLUMN "maxAutoInvestment" TYPE DECIMAL(18, 2) USING "maxAutoInvestment"::DECIMAL(18, 2);

-- CompetitionSnapshot: precios
ALTER TABLE "competition_snapshots" 
ALTER COLUMN "averagePrice" TYPE DECIMAL(18, 2) USING "averagePrice"::DECIMAL(18, 2),
ALTER COLUMN "minPrice" TYPE DECIMAL(18, 2) USING "minPrice"::DECIMAL(18, 2),
ALTER COLUMN "maxPrice" TYPE DECIMAL(18, 2) USING "maxPrice"::DECIMAL(18, 2),
ALTER COLUMN "medianPrice" TYPE DECIMAL(18, 2) USING "medianPrice"::DECIMAL(18, 2),
ALTER COLUMN "competitivePrice" TYPE DECIMAL(18, 2) USING "competitivePrice"::DECIMAL(18, 2);

-- AISuggestion: impactRevenue
ALTER TABLE "ai_suggestions" 
ALTER COLUMN "impactRevenue" TYPE DECIMAL(18, 2) USING "impactRevenue"::DECIMAL(18, 2);

COMMIT;

-- ============================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================

-- Verificar que los campos currency existen
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name IN ('products', 'sales', 'commissions', 'admin_commissions')
AND column_name = 'currency';

-- Verificar que los campos son DECIMAL
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns 
WHERE table_name IN ('users', 'products', 'sales', 'commissions', 'admin_commissions', 'successful_operations', 'user_workflow_configs', 'competition_snapshots', 'ai_suggestions')
AND data_type = 'numeric';

