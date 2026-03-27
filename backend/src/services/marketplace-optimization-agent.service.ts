import { toNumber } from '../utils/decimal.utils';

export type MarketplaceOptimizationTarget = 'mercadolibre';
export type MarketplaceOptimizationMode = 'advisory';
export type MarketplaceOptimizationActionType =
  | 'title_refinement'
  | 'attribute_completion'
  | 'image_pack_improvement'
  | 'category_review'
  | 'pricing_review'
  | 'shipping_value_review'
  | 'compliance_follow_up';

export interface MarketplaceOptimizationRecommendation {
  type: MarketplaceOptimizationActionType;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  evidence: string[];
}

export interface MarketplaceOptimizationAnalysis {
  marketplace: MarketplaceOptimizationTarget;
  mode: MarketplaceOptimizationMode;
  analyzedAt: string;
  productId: number;
  listingId: string | null;
  scores: {
    compliance: number;
    completeness: number;
    visibility: number;
    conversionReadiness: number;
    pricingReadiness: number;
  };
  advisoryState:
    | 'healthy'
    | 'needs_compliance_attention'
    | 'needs_content_improvement'
    | 'needs_pricing_review';
  recommendations: MarketplaceOptimizationRecommendation[];
  controlledLevers: string[];
  observedSignals: Record<string, unknown>;
}

export interface MarketplaceOptimizationProductSnapshot {
  id: number;
  title?: string | null;
  category?: string | null;
  images?: unknown;
  finalPrice?: unknown;
  suggestedPrice?: unknown;
  targetCountry?: string | null;
  shippingCost?: unknown;
  totalCost?: unknown;
  productData?: unknown;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseProductMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
}

function parseImageUrls(images: unknown): string[] {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      }
    } catch {
      if (images.trim().length > 0) return [images.trim()];
    }
  }
  return [];
}

function inferListingId(metadata: Record<string, any>): string | null {
  const direct = String(metadata.listingId || metadata.mercadoLibreListingId || '').trim();
  if (direct) return direct;
  const publications = Array.isArray(metadata.publications) ? metadata.publications : [];
  const firstMl = publications.find((item) => {
    const marketplace = String(item?.marketplace || '').toLowerCase();
    return marketplace === 'mercadolibre' && item?.listingId;
  });
  return firstMl?.listingId ? String(firstMl.listingId) : null;
}

export function analyzeMarketplaceOptimizationCandidate(
  product: MarketplaceOptimizationProductSnapshot
): MarketplaceOptimizationAnalysis {
  const metadata = parseProductMetadata(product.productData);
  const images = parseImageUrls(product.images);
  const title = String(product.title || '').trim();
  const category = String(product.category || '').trim();
  const listingId = inferListingId(metadata);
  const finalPrice = Math.max(
    toNumber(product.finalPrice as Parameters<typeof toNumber>[0]),
    toNumber(product.suggestedPrice as Parameters<typeof toNumber>[0])
  );
  const shippingCost = Math.max(0, toNumber(product.shippingCost as Parameters<typeof toNumber>[0]));
  const totalCost = Math.max(0, toNumber(product.totalCost as Parameters<typeof toNumber>[0]));
  const profitability = metadata.preventivePublish?.profitability || {};
  const marginRatio = Number(
    profitability.marginRatio ??
      (finalPrice > 0 && totalCost > 0 ? (finalPrice - totalCost) / finalPrice : 0)
  );
  const imageCompliance = metadata.mlChileImageCompliance || metadata.preventivePublish?.mlChileImageCompliance || {};
  const assetPack = metadata.mlChileAssetPack || metadata.preventivePublish?.mlChileAssetPack || {};
  const freight = metadata.mlChileFreight || {};

  let compliance = 45;
  if (imageCompliance.status === 'ml_image_policy_pass') compliance = 90;
  if (imageCompliance.status === 'ml_image_manual_review_required') compliance = 40;
  if (imageCompliance.status === 'ml_image_policy_fail') compliance = 10;
  if (assetPack.packApproved === true) compliance = Math.max(compliance, 96);
  if (assetPack.packApproved === false) compliance = Math.min(compliance, 55);

  let completeness = 0;
  if (title.length >= 20) completeness += 20;
  if (category) completeness += 20;
  if (images.length > 0) completeness += 15;
  if (finalPrice > 0) completeness += 15;
  if (shippingCost > 0) completeness += 15;
  if (totalCost > 0) completeness += 15;

  let visibility = 30;
  if (title.length >= 40) visibility += 20;
  if (category) visibility += 15;
  if (images.length >= 2) visibility += 15;
  if (assetPack.packApproved === true) visibility += 10;
  if (freight.freightSummaryCode === 'freight_quote_found_for_cl') visibility += 10;

  let conversionReadiness = 35;
  if (assetPack.packApproved === true) conversionReadiness += 20;
  if (shippingCost > 0) conversionReadiness += 15;
  if (totalCost > 0 && finalPrice > totalCost) conversionReadiness += 15;
  if (marginRatio > 0.2) conversionReadiness += 15;

  let pricingReadiness = 35;
  if (finalPrice > 0) pricingReadiness += 15;
  if (totalCost > 0 && finalPrice > totalCost) pricingReadiness += 20;
  if (marginRatio > 0.15) pricingReadiness += 15;
  if (marginRatio > 0.3) pricingReadiness += 10;

  const recommendations: MarketplaceOptimizationRecommendation[] = [];
  if (assetPack.packApproved !== true || imageCompliance.status !== 'ml_image_policy_pass') {
    recommendations.push({
      type: 'image_pack_improvement',
      priority: 'high',
      reason: 'MercadoLibre-ready image pack is not yet fully approved.',
      evidence: [
        `image_status=${String(imageCompliance.status || 'missing')}`,
        `packApproved=${String(assetPack.packApproved ?? false)}`,
      ],
    });
    recommendations.push({
      type: 'compliance_follow_up',
      priority: 'high',
      reason: 'Listing resilience remains exposed until the compliant asset pack is upload-ready.',
      evidence: [
        `reviewedProofState=${String(metadata.mlChileImageRemediation?.reviewedProofState || 'missing')}`,
      ],
    });
  }
  if (title.length < 40) {
    recommendations.push({
      type: 'title_refinement',
      priority: 'medium',
      reason: 'Title is short for visibility-oriented marketplace discovery.',
      evidence: [`titleLength=${title.length}`],
    });
  }
  if (!category) {
    recommendations.push({
      type: 'category_review',
      priority: 'medium',
      reason: 'Category completeness is missing.',
      evidence: ['category=missing'],
    });
  }
  if (!(shippingCost > 0) || freight.freightSummaryCode !== 'freight_quote_found_for_cl') {
    recommendations.push({
      type: 'shipping_value_review',
      priority: 'medium',
      reason: 'Shipping proposition is not fully evidenced in product metadata.',
      evidence: [
        `shippingCost=${shippingCost}`,
        `freightSummaryCode=${String(freight.freightSummaryCode || 'missing')}`,
      ],
    });
  }
  if (!(finalPrice > 0 && totalCost > 0 && finalPrice > totalCost)) {
    recommendations.push({
      type: 'pricing_review',
      priority: 'medium',
      reason: 'Price readiness needs explicit margin-positive evidence.',
      evidence: [`finalPrice=${finalPrice}`, `totalCost=${totalCost}`],
    });
  }
  if (!metadata.preventivePublish?.selectedSupplier) {
    recommendations.push({
      type: 'attribute_completion',
      priority: 'low',
      reason: 'Preventive publish metadata is incomplete for downstream optimization.',
      evidence: ['selectedSupplier=missing'],
    });
  }

  const scores = {
    compliance: clampScore(compliance),
    completeness: clampScore(completeness),
    visibility: clampScore(visibility),
    conversionReadiness: clampScore(conversionReadiness),
    pricingReadiness: clampScore(pricingReadiness),
  };

  let advisoryState: MarketplaceOptimizationAnalysis['advisoryState'] = 'healthy';
  if (scores.compliance < 70) {
    advisoryState = 'needs_compliance_attention';
  } else if (scores.completeness < 75 || scores.visibility < 70) {
    advisoryState = 'needs_content_improvement';
  } else if (scores.pricingReadiness < 70) {
    advisoryState = 'needs_pricing_review';
  }

  return {
    marketplace: 'mercadolibre',
    mode: 'advisory',
    analyzedAt: new Date().toISOString(),
    productId: product.id,
    listingId,
    scores,
    advisoryState,
    recommendations,
    controlledLevers: [
      'title_refinement',
      'attribute_completion',
      'image_pack_quality',
      'category_review',
      'pricing_review',
      'shipping_value_review',
      'compliance_follow_up',
    ],
    observedSignals: {
      titleLength: title.length,
      imageCount: images.length,
      targetCountry: String(product.targetCountry || '').trim().toUpperCase() || null,
      finalPrice,
      shippingCost,
      totalCost,
      marginRatio: Number.isFinite(marginRatio) ? marginRatio : null,
      imageStatus: imageCompliance.status || null,
      assetPackApproved: assetPack.packApproved ?? null,
      freightSummaryCode: freight.freightSummaryCode || null,
    },
  };
}
