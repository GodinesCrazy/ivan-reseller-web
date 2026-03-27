import { analyzeMarketplaceOptimizationCandidate } from '../marketplace-optimization-agent.service';

describe('marketplace-optimization-agent.service', () => {
  it('creates an advisory optimization state for a compliant candidate', () => {
    const result = analyzeMarketplaceOptimizationCandidate({
      id: 32690,
      title: 'Soporte organizador de cables adhesivo para pared y escritorio',
      category: 'MLC414091',
      images: JSON.stringify(['https://example.com/cover.png', 'https://example.com/detail.png']),
      finalPrice: 25000,
      shippingCost: 2.99,
      totalCost: 5.01,
      targetCountry: 'CL',
      productData: {
        mlChileImageCompliance: { status: 'ml_image_policy_pass' },
        mlChileAssetPack: { packApproved: true },
        mlChileFreight: { freightSummaryCode: 'freight_quote_found_for_cl' },
        preventivePublish: {
          selectedSupplier: { productId: '123' },
          profitability: { marginRatio: 0.45 },
        },
      },
    });

    expect(result.marketplace).toBe('mercadolibre');
    expect(result.mode).toBe('advisory');
    expect(result.scores.compliance).toBeGreaterThanOrEqual(90);
    expect(result.controlledLevers).toContain('image_pack_quality');
  });

  it('recommends image remediation follow-up when asset pack is not approved', () => {
    const result = analyzeMarketplaceOptimizationCandidate({
      id: 32690,
      title: 'Cable organizer',
      images: JSON.stringify(['https://example.com/raw.jpg']),
      finalPrice: 25,
      shippingCost: 2.99,
      totalCost: 5.01,
      targetCountry: 'CL',
      productData: {
        mlChileImageCompliance: { status: 'ml_image_manual_review_required' },
        mlChileAssetPack: { packApproved: false },
        mlChileImageRemediation: { reviewedProofState: 'pending_real_files' },
      },
    });

    expect(result.advisoryState).toBe('needs_compliance_attention');
    expect(result.recommendations.some((item) => item.type === 'image_pack_improvement')).toBe(true);
    expect(result.recommendations.some((item) => item.type === 'compliance_follow_up')).toBe(true);
  });
});
