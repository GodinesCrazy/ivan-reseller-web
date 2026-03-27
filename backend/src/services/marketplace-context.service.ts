import { resolveDestination, type Destination } from './destination.service';
import type { MarketplaceName } from './marketplace.service';
import { resolveListingLanguagePolicy } from './listing-language-policy.service';

export interface MarketplaceContext {
  marketplace: MarketplaceName;
  country: string;
  currency: string;
  language: string;
  requiredLanguage: string;
  region: string;
  destination: Destination;
  resolved: boolean;
  currencySafetyState: 'resolved' | 'unresolved';
  languageSafetyState: 'resolved' | 'unsupported' | 'unresolved';
  languageSupported: boolean;
  resolutionError?: string;
  languageBlockReason?: string;
  marketplaceFeeModel: 'dynamic_fee_intelligence';
  paymentFeeModel: 'dynamic_fee_intelligence';
  shippingExpectation: 'supplier_must_ship_to_marketplace_country';
}

export function getMarketplaceContext(
  marketplace: MarketplaceName,
  credentials?: Record<string, unknown>
): MarketplaceContext {
  const destination = resolveDestination(marketplace as 'ebay' | 'amazon' | 'mercadolibre', credentials as any);
  const country = (destination.countryCode || '').trim().toUpperCase();
  const currency = (destination.currency || '').trim().toUpperCase();
  const language = (destination.language || '').trim().toLowerCase();
  const region = (destination.region || country.toLowerCase()).trim().toLowerCase() || country.toLowerCase();
  const resolved = destination.resolved !== false && Boolean(country) && Boolean(currency);
  const languagePolicy = resolveListingLanguagePolicy({
    marketplace,
    country,
    resolvedLanguage: language,
  });
  const languageSafetyState =
    !language
      ? 'unresolved'
      : languagePolicy.supported
        ? 'resolved'
        : 'unsupported';

  return {
    marketplace,
    country,
    currency,
    language: languagePolicy.requiredLanguage || language,
    requiredLanguage: languagePolicy.requiredLanguage,
    region,
    destination,
    resolved,
    currencySafetyState: resolved ? 'resolved' : 'unresolved',
    languageSafetyState,
    languageSupported: languagePolicy.supported,
    resolutionError: destination.resolutionError,
    languageBlockReason: languagePolicy.reason,
    marketplaceFeeModel: 'dynamic_fee_intelligence',
    paymentFeeModel: 'dynamic_fee_intelligence',
    shippingExpectation: 'supplier_must_ship_to_marketplace_country',
  };
}

export default {
  getMarketplaceContext,
};
