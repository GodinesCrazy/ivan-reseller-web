import { rankDedupeSupplyRows } from '../supply-quote-rank';
import type { SupplyDiscoveryRow } from '../supply-quote.types';

function row(
  title: string,
  price: number,
  shipping: number | undefined,
  supplier: 'aliexpress' | 'cj'
): SupplyDiscoveryRow {
  return {
    title,
    price,
    currency: 'USD',
    productUrl: `https://example.com/${supplier}/${title}`,
    images: ['https://img.example/x.png'],
    shippingCost: shipping,
    supplyMeta: {
      supplier,
      unitCostTruth: 'listing',
      shippingTruth: shipping != null && shipping > 0 ? 'confirmed' : 'estimated',
      landedCostTruth: 'estimated_partial',
      preferredSupplierSatisfied: true,
      fallbackUsed: false,
      quoteConfidence: 'medium',
      providersAttempted: [supplier],
    },
  };
}

describe('rankDedupeSupplyRows', () => {
  it('keeps lower landed cost per title+price bucket', () => {
    const defaultShip = 5;
    const rows: SupplyDiscoveryRow[] = [
      row('USB Cable Same', 10, undefined, 'cj'),
      row('USB Cable Same', 10, 1, 'aliexpress'),
    ];
    const out = rankDedupeSupplyRows(rows, 10, defaultShip);
    expect(out).toHaveLength(1);
    expect(out[0]!.supplyMeta?.supplier).toBe('aliexpress');
  });

  it('returns two rows when titles differ', () => {
    const out = rankDedupeSupplyRows(
      [row('A', 5, undefined, 'cj'), row('B', 5, undefined, 'cj')],
      10,
      5
    );
    expect(out).toHaveLength(2);
  });
});
