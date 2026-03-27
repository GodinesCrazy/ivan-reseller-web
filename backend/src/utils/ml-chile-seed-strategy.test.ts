import {
  ML_CHILE_DISCOVERY_PATH_INVENTORY,
  deriveMlChileSeedListingPriceUsd,
  isMlChileSeedTitleSafe,
  selectMlChileSeedQueries,
  titleMatchesMlChileSeedQuery,
} from './ml-chile-seed-strategy';

describe('ML Chile seed strategy', () => {
  it('keeps the strongest Chile-first path in the inventory', () => {
    expect(
      ML_CHILE_DISCOVERY_PATH_INVENTORY.find((item) => item.key === 'affiliate_search_ship_to_cl'),
    ).toMatchObject({
      classification: 'useful_for_chile_first_seeding',
    });
  });

  it('filters obviously unsafe seed titles', () => {
    expect(isMlChileSeedTitleSafe('Rechargeable battery lamp')).toBe(false);
    expect(isMlChileSeedTitleSafe('Organizador Hello Kitty para maquillaje')).toBe(false);
    expect(isMlChileSeedTitleSafe('Adhesive cable organizer')).toBe(true);
  });

  it('keeps titles aligned with the intended seed query', () => {
    expect(titleMatchesMlChileSeedQuery('Adhesive wall hook for bathroom', 'adhesive hook')).toBe(true);
    expect(titleMatchesMlChileSeedQuery('Ceramic jewelry tray', 'adhesive hook')).toBe(false);
  });

  it('returns the highest-priority Chile seed queries first', () => {
    const selected = selectMlChileSeedQueries(3);
    expect(selected).toHaveLength(3);
    expect(selected[0]?.query).toBe('cable organizer');
  });

  it('keeps derived listing price inside the controlled ML Chile band', () => {
    expect(deriveMlChileSeedListingPriceUsd(6)).toBe(25);
    expect(deriveMlChileSeedListingPriceUsd(30)).toBe(45);
  });
});
