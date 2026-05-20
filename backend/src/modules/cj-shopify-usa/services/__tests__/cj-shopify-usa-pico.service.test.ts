import { humanizePicoTraceForUi } from '../cj-shopify-usa-pico.service';

describe('cj-shopify-usa-pico.service UI activity labels', () => {
  it('translates video render success into a human readable activity', () => {
    expect(humanizePicoTraceForUi('pico.video.render.success', { listingId: 103 })).toEqual({
      title: 'Video renderizado',
      detail: 'Creatomate dejo listo un video para listing 103.',
      tone: 'success',
    });
  });

  it('marks social publish errors as a visible pending human action', () => {
    const activity = humanizePicoTraceForUi('pico.video.publish.error', {
      platform: 'TIKTOK',
      listingId: 103,
      error: 'TIKTOK_ACCESS_TOKEN is not configured',
    });

    expect(activity.title).toBe('Publicacion tiktok pendiente');
    expect(activity.detail).toContain('TIKTOK_ACCESS_TOKEN');
    expect(activity.tone).toBe('warning');
  });

  it('summarizes blog and SEO actions with counts', () => {
    expect(humanizePicoTraceForUi('sales_agent.action.promote_via_blog', { published: 1, failed: 0 }).tone).toBe('success');
    expect(humanizePicoTraceForUi('sales_agent.action.evaluate_stagnant_listings', { updated: 0, failed: 1 }).tone).toBe('warning');
  });
});
