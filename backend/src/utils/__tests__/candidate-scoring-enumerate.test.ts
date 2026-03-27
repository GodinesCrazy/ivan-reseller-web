import { enumerateMainCandidates, mergeCanonicalSupplementUrls } from '../../services/marketplace-image-pipeline/candidate-scoring.service';

describe('P78 candidate enumeration', () => {
  it('includes non-AliExpress http URLs as supplement candidates', () => {
    const urls = [
      'https://cdn.example.com/clean-hero.png',
      'https://ae01.alicdn.com/kf/Sabc123.jpg',
    ];
    const main = enumerateMainCandidates(urls);
    expect(main.some((c) => c.url.includes('cdn.example.com'))).toBe(true);
  });

  it('prepends canonicalSupplementUrls from productData', () => {
    const merged = mergeCanonicalSupplementUrls(
      ['https://ae01.alicdn.com/kf/Sx.jpg'],
      JSON.stringify({
        mlImagePipeline: { canonicalSupplementUrls: ['https://cdn.example.com/a.jpg'] },
      })
    );
    expect(merged[0]).toContain('cdn.example.com');
  });
});
