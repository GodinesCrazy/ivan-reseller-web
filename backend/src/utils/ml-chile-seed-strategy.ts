export interface MlChileSeedQuery {
  query: string;
  category: string;
  priority: number;
}

const ML_CHILE_SHIPPING_RICH_FIRST_SEEDS: MlChileSeedQuery[] = [
  { query: 'sticker pack', category: 'stationery_small', priority: 100 },
  { query: 'washi tape', category: 'stationery_small', priority: 96 },
  { query: 'bookmark magnetic', category: 'stationery_small', priority: 94 },
  { query: 'keychain charm', category: 'light_accessories', priority: 92 },
  { query: 'hair clip', category: 'light_accessories', priority: 90 },
  { query: 'embroidery patch', category: 'craft_small', priority: 88 },
  { query: 'nail sticker', category: 'beauty_small', priority: 86 },
  { query: 'phone lanyard', category: 'light_accessories', priority: 84 },
];

const TITLE_BLOCKLIST = [
  'battery',
  'bateria',
  'lithium',
  'litio',
  'glass',
  'vidrio',
  'fragile',
  'fragil',
  'branded',
  'brand',
  'nike',
  'adidas',
  'apple',
  'samsung',
  'xiaomi',
  'oversize',
];

export function getMlChileSeedQueries(limit?: number): MlChileSeedQuery[] {
  if (!limit || limit <= 0) {
    return [...ML_CHILE_SHIPPING_RICH_FIRST_SEEDS];
  }

  return ML_CHILE_SHIPPING_RICH_FIRST_SEEDS.slice(0, limit);
}

export function selectMlChileSeedQueries(limit?: number): MlChileSeedQuery[] {
  return getMlChileSeedQueries(limit);
}

export function isMlChileSeedTitleSafe(title: string): boolean {
  const normalized = title.toLowerCase();
  return !TITLE_BLOCKLIST.some((term) => normalized.includes(term));
}

export function titleMatchesMlChileSeedQuery(title: string, query: string): boolean {
  const normalizedTitle = title.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 3);

  if (tokens.length === 0) {
    return true;
  }

  return tokens.some((token) => normalizedTitle.includes(token));
}

export function deriveMlChileSeedListingPriceUsd(salePriceUsd: number): number {
  const base = Number.isFinite(salePriceUsd) && salePriceUsd > 0 ? salePriceUsd : 1;
  const markedUp = Math.max(base * 2.8, base + 6);
  return Math.round(markedUp * 100) / 100;
}
