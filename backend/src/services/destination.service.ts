/**
 * Destination Service
 * Centralized origin-destination resolver. Origin is fixed (AliExpress/China).
 * Destination is derived from marketplace credentials (eBay site, ML siteId, Amazon marketplace).
 */
import { trace } from '../utils/boot-trace';
trace('loading destination.service');

export interface Destination {
  countryCode: string;
  currency: string;
  region: string;
  siteId?: string;
  marketplaceId?: string;
  language?: string;
  resolved?: boolean;
  resolutionError?: string;
}

/** Mercado Libre siteId -> country code (ISO) */
const ML_SITE_TO_COUNTRY: Record<string, string> = {
  MLA: 'AR',
  MLB: 'BR',
  MLC: 'CL',
  MCO: 'CO',
  MCR: 'CR',
  MEC: 'EC',
  MLM: 'MX',
  MLU: 'UY',
  MLV: 'VE',
  MPA: 'PA',
  MPE: 'PE',
  MPT: 'PT',
  MRD: 'DO',
};

/** Mercado Libre siteId -> currency */
const ML_SITE_TO_CURRENCY: Record<string, string> = {
  MLA: 'ARS',
  MLB: 'BRL',
  MLC: 'CLP',
  MCO: 'COP',
  MCR: 'CRC',
  MEC: 'USD',
  MLM: 'MXN',
  MLU: 'UYU',
  MLV: 'VES',
  MPA: 'USD',
  MPE: 'PEN',
  MPT: 'USD',
  MRD: 'DOP',
};

/** eBay marketplace_id -> country code */
const EBAY_MARKETPLACE_TO_COUNTRY: Record<string, string> = {
  EBAY_US: 'US',
  EBAY_GB: 'GB',
  EBAY_DE: 'DE',
  EBAY_ES: 'ES',
  EBAY_FR: 'FR',
  EBAY_IT: 'IT',
  EBAY_AU: 'AU',
  EBAY_CA: 'CA',
  EBAY_MX: 'MX',
};

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  DE: 'EUR',
  ES: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  AU: 'AUD',
  CA: 'CAD',
  MX: 'MXN',
  AR: 'ARS',
  BR: 'BRL',
  CL: 'CLP',
  CO: 'COP',
  PE: 'PEN',
  UY: 'UYU',
};

/** region (lowercase) -> country code (ISO) - used for opportunity search, AliExpress ship_to_country */
const REGION_TO_COUNTRY: Record<string, string> = {
  us: 'US',
  uk: 'GB',
  gb: 'GB',
  de: 'DE',
  es: 'ES',
  fr: 'FR',
  it: 'IT',
  au: 'AU',
  ca: 'CA',
  mx: 'MX',
  ar: 'AR',
  br: 'BR',
  cl: 'CL',
  co: 'CO',
  pe: 'PE',
  uy: 'UY',
};

/** region -> Mercado Libre siteId */
export const REGION_TO_ML_SITE: Record<string, string> = {
  mx: 'MLM',
  ar: 'MLA',
  br: 'MLB',
  cl: 'MLC',
  co: 'MCO',
  uy: 'MLU',
  pe: 'MPE',
};

/** region -> eBay marketplace_id */
export const REGION_TO_EBAY_MARKETPLACE: Record<string, string> = {
  us: 'EBAY_US',
  uk: 'EBAY_GB',
  gb: 'EBAY_GB',
  de: 'EBAY_DE',
  es: 'EBAY_ES',
  fr: 'EBAY_FR',
  it: 'EBAY_IT',
  au: 'EBAY_AU',
  ca: 'EBAY_CA',
  mx: 'EBAY_MX',
};

/** country code -> language for listings */
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  US: 'en',
  GB: 'en',
  DE: 'de',
  ES: 'es',
  FR: 'fr',
  IT: 'it',
  AU: 'en',
  CA: 'en',
  MX: 'es',
  AR: 'es',
  BR: 'pt',
  CL: 'es',
  CO: 'es',
  PE: 'es',
};

/**
 * Convert region (cl, us, mx, etc.) to ISO country code for AliExpress ship_to_country, taxes, etc.
 */
export function regionToCountryCode(region: string): string {
  if (!region || typeof region !== 'string') return 'US';
  const r = region.toLowerCase().trim();
  if (REGION_TO_COUNTRY[r]) return REGION_TO_COUNTRY[r];
  if (r.length === 2) return r.toUpperCase();
  const normalized: Record<string, string> = {
    chile: 'CL',
    mexico: 'MX',
    argentina: 'AR',
    brazil: 'BR',
    spain: 'ES',
    italy: 'IT',
    germany: 'DE',
    france: 'FR',
  };
  return normalized[r] || 'US';
}

function buildUnresolvedDestination(reason: string, fallback: Partial<Destination> = {}): Destination {
  return {
    countryCode: '',
    currency: '',
    region: '',
    language: fallback.language || '',
    siteId: fallback.siteId,
    marketplaceId: fallback.marketplaceId,
    resolved: false,
    resolutionError: reason,
  };
}

export function resolveDestinationStrict(
  marketplace: 'ebay' | 'amazon' | 'mercadolibre',
  credentials?: { siteId?: string; marketplace?: string; marketplace_id?: string }
): Destination {
  const creds = credentials || {};

  if (marketplace === 'mercadolibre') {
    const siteId = (creds.siteId || '').toUpperCase().trim();
    if (!siteId) {
      return buildUnresolvedDestination('mercadolibre_site_id_missing');
    }
    const countryCode = ML_SITE_TO_COUNTRY[siteId];
    const currency = ML_SITE_TO_CURRENCY[siteId];
    if (!countryCode || !currency) {
      return buildUnresolvedDestination(`mercadolibre_site_unmapped:${siteId}`, { siteId });
    }
    return {
      countryCode,
      currency,
      region: countryCode.toLowerCase(),
      siteId,
      language: COUNTRY_TO_LANGUAGE[countryCode] || 'es',
      resolved: true,
    };
  }

  if (marketplace === 'ebay') {
    const marketplaceId = String(creds.marketplace_id || '').trim().toUpperCase();
    if (!marketplaceId) {
      return buildUnresolvedDestination('ebay_marketplace_id_missing');
    }
    const countryCode = EBAY_MARKETPLACE_TO_COUNTRY[marketplaceId];
    const currency = countryCode ? COUNTRY_TO_CURRENCY[countryCode] : undefined;
    if (!countryCode || !currency) {
      return buildUnresolvedDestination(`ebay_marketplace_unmapped:${marketplaceId}`, { marketplaceId });
    }
    return {
      countryCode,
      currency,
      region: countryCode.toLowerCase(),
      marketplaceId,
      language: COUNTRY_TO_LANGUAGE[countryCode] || 'en',
      resolved: true,
    };
  }

  if (marketplace === 'amazon') {
    const mp = String(creds.marketplace || '').trim().toUpperCase();
    if (!mp) {
      return buildUnresolvedDestination('amazon_marketplace_missing');
    }

    const countryCode =
      mp.includes('A1F83G8C2ARO7P') || mp.includes('UK') ? 'GB'
      : mp.includes('A1PA6795UKMFR9') || mp.includes('DE') ? 'DE'
      : mp.includes('A13V1IB3VIYZZH') || mp.includes('FR') ? 'FR'
      : mp.includes('APJ6JRA9NG5V4') || mp.includes('IT') ? 'IT'
      : mp.includes('A1RKKUPIHCS9HS') || mp.includes('ES') ? 'ES'
      : mp.includes('ATVPDKIKX0DER') || mp.includes('US') ? 'US'
      : '';
    const currency = countryCode ? COUNTRY_TO_CURRENCY[countryCode] : undefined;
    if (!countryCode || !currency) {
      return buildUnresolvedDestination(`amazon_marketplace_unmapped:${mp}`, { marketplaceId: mp });
    }
    return {
      countryCode,
      currency,
      region: countryCode.toLowerCase(),
      marketplaceId: mp,
      language: COUNTRY_TO_LANGUAGE[countryCode] || 'en',
      resolved: true,
    };
  }

  return buildUnresolvedDestination(`unsupported_marketplace:${marketplace}`);
}

/**
 * Resolve destination from marketplace and credentials.
 * Used for publish, preview, and cost calculation.
 */
export function resolveDestination(
  marketplace: 'ebay' | 'amazon' | 'mercadolibre',
  credentials?: { siteId?: string; marketplace?: string; marketplace_id?: string }
): Destination {
  const strict = resolveDestinationStrict(marketplace, credentials);
  if (strict.resolved) {
    return strict;
  }

  const creds = credentials || {};
  const defaultDest: Destination = {
    countryCode: 'US',
    currency: 'USD',
    region: 'us',
    language: 'en',
    resolved: false,
    resolutionError: strict.resolutionError || 'defaulted_destination_context',
  };

  if (marketplace === 'mercadolibre') {
    const siteId = (creds.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC').toUpperCase();
    const countryCode = ML_SITE_TO_COUNTRY[siteId] || 'CL';
    const currency = ML_SITE_TO_CURRENCY[siteId] || 'CLP';
    const region = countryCode.toLowerCase();
    return {
      countryCode,
      currency,
      region,
      siteId,
      language: COUNTRY_TO_LANGUAGE[countryCode] || 'es',
      resolved: Boolean(ML_SITE_TO_COUNTRY[siteId] && ML_SITE_TO_CURRENCY[siteId]),
      resolutionError: strict.resolutionError,
    };
  }

  if (marketplace === 'ebay') {
    const marketplaceId = creds.marketplace_id || 'EBAY_US';
    const countryCode = EBAY_MARKETPLACE_TO_COUNTRY[marketplaceId] || 'US';
    const region = countryCode.toLowerCase();
    const currency = COUNTRY_TO_CURRENCY[countryCode] || 'USD';
    return {
      countryCode,
      currency,
      region,
      marketplaceId,
      language: COUNTRY_TO_LANGUAGE[countryCode] || 'en',
      resolved: Boolean(EBAY_MARKETPLACE_TO_COUNTRY[marketplaceId] && COUNTRY_TO_CURRENCY[countryCode]),
      resolutionError: strict.resolutionError,
    };
  }

  if (marketplace === 'amazon') {
    const mp = creds.marketplace || '';
    const countryCode = mp.includes('UK') || mp.includes('A1F83G8C2ARO7P') ? 'GB'
      : mp.includes('DE') ? 'DE'
      : mp.includes('FR') ? 'FR'
      : mp.includes('IT') ? 'IT'
      : mp.includes('ES') ? 'ES'
      : 'US';
    const region = countryCode.toLowerCase();
    const currency = COUNTRY_TO_CURRENCY[countryCode] || 'USD';
    return {
      countryCode,
      currency,
      region,
      marketplaceId: mp || undefined,
      language: COUNTRY_TO_LANGUAGE[countryCode] || 'en',
      resolved: Boolean(mp),
      resolutionError: strict.resolutionError,
    };
  }

  return defaultDest;
}
