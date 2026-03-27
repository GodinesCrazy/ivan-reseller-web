export interface MlChileShippingRichSeedQuery {
  query: string;
  category: string;
  priority: number;
  rationale: string;
}

const SHIPPING_RICH_SEED_QUERIES: MlChileShippingRichSeedQuery[] = [
  {
    query: 'sticker pack',
    category: 'stationery_small',
    priority: 100,
    rationale: 'Very small, flat, low-breakage products often have simpler international shipping options.',
  },
  {
    query: 'washi tape',
    category: 'stationery_small',
    priority: 96,
    rationale: 'Lightweight stationery items may expose low-cost tracked or economy shipping paths.',
  },
  {
    query: 'bookmark magnetic',
    category: 'stationery_small',
    priority: 94,
    rationale: 'Thin paper or magnet accessories are small enough to test shipping-rich supplier patterns.',
  },
  {
    query: 'keychain charm',
    category: 'light_accessories',
    priority: 92,
    rationale: 'Small accessory items can reveal carrier/service lines without high breakage risk.',
  },
  {
    query: 'hair clip',
    category: 'light_accessories',
    priority: 90,
    rationale: 'Common lightweight accessory with simple variant structures and low cube/weight.',
  },
  {
    query: 'embroidery patch',
    category: 'craft_small',
    priority: 88,
    rationale: 'Flat craft items are good candidates for shipping-rich low-cost routing.',
  },
  {
    query: 'nail sticker',
    category: 'beauty_small',
    priority: 86,
    rationale: 'Small beauty accessories can reveal explicit free-shipping or low-fee patterns.',
  },
  {
    query: 'phone lanyard',
    category: 'light_accessories',
    priority: 84,
    rationale: 'Accessory products may expose richer carrier structures than storage organizers.',
  },
  {
    query: 'mini zipper pouch',
    category: 'travel_small',
    priority: 80,
    rationale: 'Soft small bags are lightweight while remaining low-fragility for first-operation screening.',
  },
  {
    query: 'craft beads',
    category: 'craft_small',
    priority: 78,
    rationale: 'High-volume lightweight supplies help test whether richer logistics patterns exist in craft families.',
  },
];

export function getMlChileShippingRichSeedQueries(limit?: number): MlChileShippingRichSeedQuery[] {
  if (!limit || limit <= 0) {
    return [...SHIPPING_RICH_SEED_QUERIES];
  }

  return SHIPPING_RICH_SEED_QUERIES.slice(0, limit);
}

export function classifyMlChileShippingPattern(admittedAfterShippingCostGate: number): string {
  if (admittedAfterShippingCostGate > 0) {
    return 'shipping-rich for CL';
  }

  return 'shipping-poor for CL';
}
