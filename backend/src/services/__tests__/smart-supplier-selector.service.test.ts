import { buildOptimizedSearchQuery, titleSimilarityRatio } from '../smart-supplier-selector.service';

describe('smart-supplier-selector', () => {
  it('buildOptimizedSearchQuery caps words and strips noise', () => {
    const t =
      'Lockable 24 Slot Watch Box Double Layer Carbon Fiber Organizer USA Free Shipping';
    const q = buildOptimizedSearchQuery(t, 6);
    const words = q.split(/\s+/);
    expect(words.length).toBeLessThanOrEqual(6);
    expect(q.toLowerCase()).toContain('watch');
    expect(q.toLowerCase()).toContain('box');
  });

  it('titleSimilarityRatio is high for similar titles', () => {
    const a = '24 slot watch box carbon fiber lockable';
    const b = 'Lockable Watch Box 24 Slots Carbon Fiber Display Case';
    expect(titleSimilarityRatio(a, b)).toBeGreaterThanOrEqual(0.6);
  });
});
