/**
 * Build-time flags (Vite). Must match operator intent with backend ENABLE_* flags in deployment.
 */
export function isCjEbayModuleEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_CJ_EBAY_MODULE || '').toLowerCase() === 'true';
}

export function isCjMlChileModuleEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_CJ_ML_CHILE_MODULE || '').toLowerCase() === 'true';
}
