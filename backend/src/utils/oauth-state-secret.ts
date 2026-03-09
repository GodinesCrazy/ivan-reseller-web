/**
 * Centralized OAuth state secret resolution.
 * Used for HMAC signing/verification of OAuth state (eBay, MercadoLibre).
 *
 * In producción usamos SIEMPRE JWT_SECRET como fuente de verdad para OAuth,
 * para evitar que cambios en ENCRYPTION_KEY (usada para cifrado de credenciales)
 * rompan la firma del parámetro `state`.
 */
export function getOAuthStateSecret(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  let s: string | undefined;

  if (isProduction) {
    // Producción: JWT_SECRET es la única fuente para OAuth state
    s = process.env.JWT_SECRET;
  } else {
    // Dev: permitir ENCRYPTION_KEY o JWT_SECRET para facilitar pruebas locales
    s = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  }

  if (!s || s === 'default-key') return '';
  return s;
}
