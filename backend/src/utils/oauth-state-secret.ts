/**
 * Centralized OAuth state secret resolution.
 * Used for HMAC signing/verification of OAuth state (eBay, MercadoLibre).
 * Ensures the same secret is used when generating and verifying state.
 */
export function getOAuthStateSecret(): string {
  const s = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!s || s === 'default-key') return '';
  return s;
}
