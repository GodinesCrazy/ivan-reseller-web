/**
 * Heurística de tamaño de paquete para oportunidades (Affiliate no siempre envía peso/volumen).
 * Se usa precio unitario en USD del proveedor + palabras “pesadas” en el título.
 */

const HEAVY_TITLE_PATTERN =
  /\b(treadmill|furniture|sofa|couch|mattress|refrigerator|washing\s*machine|e-?bike|electric\s+scooter|gym\s+equipment|barbell|dumbbell\s+set|television|tv\s+stand|bookshelf|wardrobe|treadmill)\b/i;

export type PackageTier = 'small' | 'medium' | 'large';

export function inferOpportunityPackageTier(params: {
  sourcePriceUsd: number;
  title: string;
  smallMaxUsd: number;
  mediumMaxUsd: number;
}): PackageTier {
  const title = String(params.title || '');
  if (HEAVY_TITLE_PATTERN.test(title)) return 'large';
  const p = Number(params.sourcePriceUsd);
  if (!Number.isFinite(p) || p <= 0) return 'large';
  const sm = Math.max(1, Number(params.smallMaxUsd) || 45);
  const mm = Math.max(sm + 1, Number(params.mediumMaxUsd) || 120);
  if (p <= sm) return 'small';
  if (p <= mm) return 'medium';
  return 'large';
}

export function parseAllowedPackageTiers(csv: string | null | undefined): Set<PackageTier> {
  const raw = String(csv || 'small')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set<PackageTier>();
  for (const t of raw) {
    if (t === 'small' || t === 'medium' || t === 'large') allowed.add(t);
  }
  if (allowed.size === 0) allowed.add('small');
  return allowed;
}

export function isPackageTierAllowed(tier: PackageTier, allowed: Set<PackageTier>): boolean {
  return allowed.has(tier);
}

export type DiscoveryRowForTier = {
  title: string;
  sourcePrice?: number;
  sourceCurrency?: string;
  price?: number;
  currency?: string;
};

/**
 * Filtra filas de discovery (Affiliate / scraper) según tamaños permitidos en configuración.
 */
export function filterDiscoveryProductsByPackageTier<T extends DiscoveryRowForTier>(
  rows: T[],
  commerce: {
    allowedTiers: Set<PackageTier>;
    smallMaxPriceUsd: number;
    mediumMaxPriceUsd: number;
  },
  convertToUsd: (amount: number, fromCurrency: string) => number
): T[] {
  return rows.filter((p) => {
    let priceUsd = 0;
    const sp = Number(p.sourcePrice);
    if (Number.isFinite(sp) && sp > 0) {
      priceUsd = convertToUsd(sp, String(p.sourceCurrency || 'USD').toUpperCase());
    } else {
      const pb = Number(p.price);
      if (Number.isFinite(pb) && pb > 0) {
        priceUsd = convertToUsd(pb, String(p.currency || 'USD').toUpperCase());
      }
    }
    const tier = inferOpportunityPackageTier({
      sourcePriceUsd: priceUsd,
      title: p.title,
      smallMaxUsd: commerce.smallMaxPriceUsd,
      mediumMaxUsd: commerce.mediumMaxPriceUsd,
    });
    return commerce.allowedTiers.has(tier);
  });
}
