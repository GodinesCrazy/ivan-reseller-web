import {
  candidateMatchesQuery,
  getSearchQueryForFirstProduct,
  P6_FIRST_PRODUCT_RECOVERY_QUERIES,
} from '../../services/multi-region-validation.service';

describe('multi-region-validation.service first-product query quality', () => {
  it('uses safer normalized search queries for first-product recovery', () => {
    expect(getSearchQueryForFirstProduct('cable organizer')).toBe('cable organizer clip');
    expect(getSearchQueryForFirstProduct('phone stand')).toBe('desk phone stand');
    expect(getSearchQueryForFirstProduct('webcam cover')).toBe('webcam cover slider');
  });

  it('rejects obvious bad matches for phone stand and cable organizer', () => {
    expect(
      candidateMatchesQuery(
        'phone stand',
        'Table Lamp with 3 USB Charging Ports Modern Desk Lamp with Phone Stand',
        'en'
      )
    ).toBe(false);

    expect(
      candidateMatchesQuery(
        'cable organizer',
        'Marine throttle control box compatible with steering cable right hand control',
        'en'
      )
    ).toBe(false);
  });

  it('keeps simple relevant matches for safe-product recovery', () => {
    expect(
      candidateMatchesQuery(
        'cell phone holder',
        'Magnetic phone holder stand for desk and car dashboard',
        'en'
      )
    ).toBe(true);

    expect(
      candidateMatchesQuery(
        'desk organizer',
        'Desk organizer pen holder storage box for office',
        'en'
      )
    ).toBe(true);
  });

  it('uses a narrower commodity-first P6 recovery query set', () => {
    expect(P6_FIRST_PRODUCT_RECOVERY_QUERIES).toEqual([
      'adhesive cable clips',
      'silicone cable ties',
      'webcam cover',
      'screen cleaning cloth',
      'adhesive wall hook',
    ]);
  });

  it('rejects branded or decorative matches in the new commodity-first strategy', () => {
    expect(
      candidateMatchesQuery(
        'screen cleaning cloth',
        'Anime microfiber blanket for bedroom sofa gift set',
        'en'
      )
    ).toBe(false);

    expect(
      candidateMatchesQuery(
        'webcam cover',
        'Ring light tripod camera set with phone case holder',
        'en'
      )
    ).toBe(false);
  });
});
