/**
 * ? FIX AUTH: Parser robusto de cookies para manejar casos edge
 * Soporta tanto req.cookies (cookie-parser) como req.headers.cookie (raw header)
 */

export function parseCookiesFromHeader(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  if (!cookieHeader) {
    return cookies;
  }
  
  // Parsear cookies del header raw
  const cookiePairs = cookieHeader.split(';');
  
  for (const pair of cookiePairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;
    
    const key = trimmed.substring(0, equalIndex).trim();
    const value = trimmed.substring(equalIndex + 1).trim();
    
    // Decodificar URL encoding si es necesario
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  
  return cookies;
}

/**
 * Obtener token desde múltiples fuentes (cookies parseadas, header raw, Authorization header)
 */
export function getTokenFromRequest(req: any): string | undefined {
  // Prioridad 1: req.cookies (cookie-parser ya parseó)
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  
  // Prioridad 2: Parsear manualmente desde req.headers.cookie
  if (req.headers?.cookie) {
    const parsedCookies = parseCookiesFromHeader(req.headers.cookie);
    if (parsedCookies.token) {
      return parsedCookies.token;
    }
  }
  
  // Prioridad 3: Authorization header
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return undefined;
}
