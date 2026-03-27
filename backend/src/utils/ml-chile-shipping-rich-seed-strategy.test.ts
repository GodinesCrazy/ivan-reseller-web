import {
  classifyMlChileShippingPattern,
  getMlChileShippingRichSeedQueries,
} from './ml-chile-shipping-rich-seed-strategy';

describe('ML Chile shipping-rich seed strategy', () => {
  it('returns a shipping-rich-first query set', () => {
    const queries = getMlChileShippingRichSeedQueries();

    expect(queries.length).toBeGreaterThan(5);
    expect(queries[0]).toMatchObject({
      query: 'sticker pack',
      category: 'stationery_small',
    });
  });

  it('limits the strategy deterministically', () => {
    const queries = getMlChileShippingRichSeedQueries(3);

    expect(queries).toHaveLength(3);
    expect(queries.map((query) => query.query)).toEqual([
      'sticker pack',
      'washi tape',
      'bookmark magnetic',
    ]);
  });

  it('classifies shipping-rich patterns when at least one candidate survives the shipping gate', () => {
    expect(classifyMlChileShippingPattern(1)).toBe('shipping-rich for CL');
    expect(classifyMlChileShippingPattern(0)).toBe('shipping-poor for CL');
  });
});
