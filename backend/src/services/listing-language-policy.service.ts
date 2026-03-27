import type { MarketplaceName } from './marketplace.service';

export interface ListingLanguagePolicyResult {
  marketplace: MarketplaceName;
  country: string;
  resolvedLanguage: string;
  requiredLanguage: string;
  supported: boolean;
  reason?: string;
}

const LANGUAGE_POLICY: Record<MarketplaceName, Partial<Record<string, string>>> = {
  mercadolibre: {
    CL: 'es',
  },
  ebay: {
    US: 'en',
    GB: 'en',
    ES: 'es',
  },
  amazon: {
    US: 'en',
  },
};

export function resolveListingLanguagePolicy(params: {
  marketplace: MarketplaceName;
  country?: string | null;
  resolvedLanguage?: string | null;
}): ListingLanguagePolicyResult {
  const marketplace = params.marketplace;
  const country = String(params.country || '').trim().toUpperCase();
  const resolvedLanguage = String(params.resolvedLanguage || '').trim().toLowerCase();

  if (!country) {
    return {
      marketplace,
      country: '',
      resolvedLanguage,
      requiredLanguage: '',
      supported: false,
      reason: 'language_context_country_missing',
    };
  }

  const requiredLanguage = LANGUAGE_POLICY[marketplace]?.[country] || '';
  if (!requiredLanguage) {
    return {
      marketplace,
      country,
      resolvedLanguage,
      requiredLanguage: '',
      supported: false,
      reason: `unsupported_language_marketplace_country:${marketplace}:${country}`,
    };
  }

  if (!resolvedLanguage) {
    return {
      marketplace,
      country,
      resolvedLanguage: '',
      requiredLanguage,
      supported: false,
      reason: `language_unresolved:${marketplace}:${country}`,
    };
  }

  if (resolvedLanguage !== requiredLanguage) {
    return {
      marketplace,
      country,
      resolvedLanguage,
      requiredLanguage,
      supported: false,
      reason: `language_mismatch:${marketplace}:${country}:${requiredLanguage}:${resolvedLanguage}`,
    };
  }

  return {
    marketplace,
    country,
    resolvedLanguage,
    requiredLanguage,
    supported: true,
  };
}

export function isListingLanguageSupported(params: {
  marketplace: MarketplaceName;
  country?: string | null;
  resolvedLanguage?: string | null;
}): boolean {
  return resolveListingLanguagePolicy(params).supported;
}
