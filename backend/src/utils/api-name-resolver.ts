/**
 * API Name Resolver
 * Centraliza la normalización de nombres de APIs para eliminar inconsistencias
 * 
 * Este resolver maneja:
 * - Normalización de nombres frontend → backend
 * - Normalización de nombres backend → frontend
 * - Aliases y variaciones de nombres
 */

export type APIName = 
  | 'serpapi' 
  | 'googletrends'
  | 'ebay'
  | 'amazon'
  | 'mercadolibre'
  | 'paypal'
  | 'stripe'
  | 'groq'
  | 'scraperapi'
  | 'zenrows'
  | '2captcha'
  | 'aliexpress'
  | 'aliexpress-affiliate'
  | 'aliexpress-dropshipping'
  | 'email'
  | 'twilio'
  | 'slack'
  | 'openai';

/**
 * Mapeo de aliases a nombres canónicos del backend
 * Frontend puede usar cualquier alias, pero el backend siempre usa el nombre canónico
 */
const API_ALIASES_TO_CANONICAL: Record<string, APIName> = {
  // Google Trends / SerpAPI
  'googletrends': 'serpapi',
  'google-trends': 'serpapi',
  'google_trends': 'serpapi',
  'serpapi': 'serpapi',
  'serp-api': 'serpapi',
  'serp_api': 'serpapi',
  
  // eBay
  'ebay': 'ebay',
  'e-bay': 'ebay',
  'ebay-api': 'ebay',
  
  // Amazon
  'amazon': 'amazon',
  'amazon-api': 'amazon',
  
  // MercadoLibre
  'mercadolibre': 'mercadolibre',
  'mercado-libre': 'mercadolibre',
  'mercadolibre-api': 'mercadolibre',
  
  // PayPal
  'paypal': 'paypal',
  'pay-pal': 'paypal',
  'paypal-api': 'paypal',
  
  // Stripe
  'stripe': 'stripe',
  'stripe-api': 'stripe',
  
  // GROQ
  'groq': 'groq',
  'groq-api': 'groq',
  
  // ScraperAPI
  'scraperapi': 'scraperapi',
  'scraper-api': 'scraperapi',
  'scraper_api': 'scraperapi',
  
  // ZenRows
  'zenrows': 'zenrows',
  'zen-rows': 'zenrows',
  'zen_rows': 'zenrows',
  
  // 2Captcha
  '2captcha': '2captcha',
  '2-captcha': '2captcha',
  'two-captcha': '2captcha',
  
  // AliExpress
  'aliexpress': 'aliexpress',
  'ali-express': 'aliexpress',
  'aliexpress-affiliate': 'aliexpress-affiliate',
  'aliexpress-dropshipping': 'aliexpress-dropshipping',
  
  // Email
  'email': 'email',
  'email-api': 'email',
  
  // Twilio
  'twilio': 'twilio',
  'twilio-api': 'twilio',
  
  // Slack
  'slack': 'slack',
  'slack-api': 'slack',
  
  // OpenAI
  'openai': 'openai',
  'open-ai': 'openai',
  'openai-api': 'openai',
};

/**
 * Mapeo de nombres canónicos del backend a nombres de visualización para el frontend
 * Algunas APIs tienen nombres diferentes en frontend para mejor UX
 */
const CANONICAL_TO_FRONTEND: Partial<Record<APIName, string>> = {
  'serpapi': 'googletrends', // Frontend usa 'googletrends' aunque backend usa 'serpapi'
};

/**
 * Resuelve un nombre de API a su forma canónica (backend)
 * Acepta cualquier alias o variación y retorna el nombre estándar del backend
 */
export function resolveToCanonical(apiName: string): APIName {
  const normalized = apiName.toLowerCase().trim();
  const canonical = API_ALIASES_TO_CANONICAL[normalized];
  
  if (!canonical) {
    // Si no hay alias, asumir que ya es canónico (con validación básica)
    return normalized as APIName;
  }
  
  return canonical;
}

/**
 * Resuelve un nombre canónico del backend a su nombre de visualización para el frontend
 * Si hay un mapeo específico, lo usa; si no, retorna el nombre canónico
 */
export function resolveToFrontend(canonicalName: APIName | string): string {
  const canonical = resolveToCanonical(canonicalName);
  return CANONICAL_TO_FRONTEND[canonical] || canonical;
}

/**
 * Normaliza un nombre de API para uso interno (backend)
 * Esto asegura consistencia en toda la aplicación
 */
export function normalizeAPIName(apiName: string): APIName {
  return resolveToCanonical(apiName);
}

/**
 * Obtiene todos los aliases posibles para un nombre canónico
 */
export function getAliasesForCanonical(canonicalName: APIName): string[] {
  return Object.entries(API_ALIASES_TO_CANONICAL)
    .filter(([_, canonical]) => canonical === canonicalName)
    .map(([alias]) => alias);
}

/**
 * Verifica si un nombre de API es válido
 */
export function isValidAPIName(apiName: string): boolean {
  const canonical = resolveToCanonical(apiName);
  return canonical in API_ALIASES_TO_CANONICAL || 
         Object.values(API_ALIASES_TO_CANONICAL).includes(canonical as APIName);
}

