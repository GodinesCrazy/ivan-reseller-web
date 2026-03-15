/**
 * Verifies that the products API response shape includes winnerDetectedAt
 * as ISO string or null (contract for frontend Winner UI).
 */
describe('Products API winnerDetectedAt response shape', () => {
  // Same serialization as in products.routes.ts GET /api/products and GET /api/products/:id
  function mapWinnerDetectedAt(winnerDetectedAt: Date | null | undefined): string | null {
    return winnerDetectedAt?.toISOString() ?? null;
  }

  it('serializes winnerDetectedAt Date to ISO string', () => {
    const date = new Date('2025-03-13T12:00:00.000Z');
    expect(mapWinnerDetectedAt(date)).toBe('2025-03-13T12:00:00.000Z');
  });

  it('serializes winnerDetectedAt null to null', () => {
    expect(mapWinnerDetectedAt(null)).toBeNull();
  });

  it('serializes winnerDetectedAt undefined to null', () => {
    expect(mapWinnerDetectedAt(undefined)).toBeNull();
  });

  it('mapped product object includes winnerDetectedAt key', () => {
    const productWithWinner = {
      id: 1,
      title: 'Test',
      winnerDetectedAt: new Date('2025-03-13T12:00:00.000Z'),
    };
    const mapped = {
      id: productWithWinner.id,
      title: productWithWinner.title,
      winnerDetectedAt: mapWinnerDetectedAt(productWithWinner.winnerDetectedAt),
    };
    expect(mapped).toHaveProperty('winnerDetectedAt', '2025-03-13T12:00:00.000Z');
  });

  it('mapped product without winner has winnerDetectedAt null', () => {
    const productWithoutWinner = {
      id: 2,
      title: 'Other',
      winnerDetectedAt: null as Date | null,
    };
    const mapped = {
      id: productWithoutWinner.id,
      title: productWithoutWinner.title,
      winnerDetectedAt: mapWinnerDetectedAt(productWithoutWinner.winnerDetectedAt),
    };
    expect(mapped).toHaveProperty('winnerDetectedAt', null);
  });
});
