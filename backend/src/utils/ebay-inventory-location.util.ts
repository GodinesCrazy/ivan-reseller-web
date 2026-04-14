export type EbayInventoryShipFromMode = 'CN' | 'US' | 'LEGACY';

export interface EbayLocationRow {
  merchantLocationKey?: string;
  location?: { address?: { country?: string } };
}

function countryCode(loc: EbayLocationRow): string {
  return String(loc?.location?.address?.country ?? '')
    .trim()
    .toUpperCase();
}

/**
 * Picks an existing eBay inventory merchantLocationKey by ship-from preference.
 * LEGACY: prefer Chile (CL), then first location (historical behavior).
 */
export function pickMerchantLocationKey(
  locations: EbayLocationRow[],
  mode: EbayInventoryShipFromMode,
): string | null {
  if (!Array.isArray(locations) || locations.length === 0) return null;

  if (mode === 'LEGACY') {
    const cl = locations.find((l) => countryCode(l) === 'CL');
    const pick = cl ?? locations[0];
    const key = String(pick?.merchantLocationKey ?? '').trim();
    return key || null;
  }

  if (mode === 'US') {
    const hit = locations.find((l) => countryCode(l) === 'US');
    const key = String(hit?.merchantLocationKey ?? '').trim();
    return key || null;
  }

  const hit = locations.find((l) => countryCode(l) === 'CN');
  const key = String(hit?.merchantLocationKey ?? '').trim();
  return key || null;
}
