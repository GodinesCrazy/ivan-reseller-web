/**
 * Build-time flags (Vite). Must match operator intent with backend ENABLE_CJ_EBAY_MODULE in deployment.
 */
export function isCjEbayModuleEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_CJ_EBAY_MODULE || '').toLowerCase() === 'true';
}
