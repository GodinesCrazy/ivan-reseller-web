-- Opportunity Phase B: per-user supplier preference for discovery (aliexpress | cj | auto). NULL = use env OPPORTUNITY_SUPPLIER_PREFERENCE / default auto.
ALTER TABLE "user_settings" ADD COLUMN "opportunitySupplierPreference" TEXT;
