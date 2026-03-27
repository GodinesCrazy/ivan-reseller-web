import { prisma } from '../config/database';
import { getProductValidationSnapshot } from './catalog-validation-state.service';
import { analyzeMarketplaceOptimizationCandidate } from './marketplace-optimization-agent.service';
import { MarketplaceService } from './marketplace.service';

type SupportedEnvironment = 'production' | 'sandbox' | 'all';

export interface OperationsTruthAgentTrace {
  agentName: string;
  stage: string;
  decision: string;
  reasonCode: string;
  evidenceSummary: string[];
  blocking: boolean;
  advisory: boolean;
  nextAction: string | null;
  decidedAt: string | null;
}

export interface OperationsTruthItem {
  productId: number;
  productTitle: string;
  marketplace: string | null;
  listingId: string | null;
  localListingState: string | null;
  externalMarketplaceState: string | null;
  externalMarketplaceSubStatus: string[];
  listingUrl: string | null;
  lastMarketplaceSyncAt: string | null;
  imageRemediationState: string | null;
  publicationReadinessState: string | null;
  blockerCode: string | null;
  blockerMessage: string | null;
  nextAction: string | null;
  orderIngested: boolean;
  supplierPurchaseProved: boolean;
  trackingAttached: boolean;
  deliveredTruthObtained: boolean;
  releasedFundsObtained: boolean;
  realizedProfitObtained: boolean;
  proofUpdatedAt: string | null;
  lastAgentDecision: string | null;
  lastAgentDecisionReason: string | null;
  decidedAt: string | null;
  sourceLabels: {
    listing: string;
    blocker: string;
    proof: string;
    agent: string;
  };
  agentTrace: OperationsTruthAgentTrace | null;
}

export interface OperationsTruthBundle {
  generatedAt: string;
  items: OperationsTruthItem[];
  summary: {
    liveStateCounts: {
      active: number;
      under_review: number;
      paused: number;
      failed_publish: number;
      unknown: number;
    };
    blockerCounts: Array<{ blockerCode: string; count: number }>;
    proofCounts: {
      orderIngested: number;
      supplierPurchaseProved: number;
      trackingAttached: number;
      deliveredTruthObtained: number;
      releasedFundsObtained: number;
      realizedProfitObtained: number;
    };
  };
}

interface BuildOperationsTruthParams {
  userId?: number;
  productIds?: number[];
  limit?: number;
  environment?: SupportedEnvironment;
}

function parseMetadata(raw: unknown): Record<string, any> {
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

function firstNonEmptyString(...values: Array<unknown>): string | null {
  for (const value of values) {
    const stringValue = String(value ?? '').trim();
    if (stringValue) return stringValue;
  }
  return null;
}

function parseIsoDate(value: unknown): number {
  const time = Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? time : 0;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeLiveState(value: string | null | undefined): 'active' | 'under_review' | 'paused' | 'failed_publish' | 'unknown' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'active') return 'active';
  if (normalized === 'under_review') return 'under_review';
  if (normalized === 'paused' || normalized === 'closed') return 'paused';
  if (normalized === 'failed_publish' || normalized === 'not_found') return 'failed_publish';
  return 'unknown';
}

function deriveNextActionFromBlocker(blockerCode: string | null, marketplace: string | null): string | null {
  switch (blockerCode) {
    case 'marketplace_waiting_for_patch':
      return 'Patch the marketplace listing and resubmit external review.';
    case 'listing_failed_publish':
      return 'Review the publish failure and rerun the listing publish path.';
    case 'listing_paused':
      return 'Review the paused marketplace listing and restore it only after blocker resolution.';
    case 'ml_image_pack_not_approved':
      return 'Approve or regenerate the ML image asset pack before publish/reactivation.';
    case 'missingSku':
      return 'Resolve supplier SKU truth before publication.';
    case 'missingShipping':
      return 'Resolve destination shipping truth before publication.';
    case 'incompleteFees':
      return 'Complete fee ledger truth before publication.';
    case 'policyIncomplete':
      return 'Complete marketplace policy/compliance truth before publication.';
    case 'invalidMarketplaceContext':
      return 'Repair marketplace context and rerun validation.';
    default:
      if (marketplace === 'mercadolibre') {
        return 'Review MercadoLibre live state and resolve the exact blocker before continuing.';
      }
      return null;
  }
}

function deriveBlocker(params: {
  externalMarketplaceState: string | null;
  externalMarketplaceSubStatus: string[];
  localListingState: string | null;
  validationBlockedReasons: string[];
  metadata: Record<string, any>;
  marketplace: string | null;
}): { blockerCode: string | null; blockerMessage: string | null; nextAction: string | null } {
  const subStatus = params.externalMarketplaceSubStatus.map((value) => String(value).trim().toLowerCase());
  if (String(params.externalMarketplaceState || '').trim().toLowerCase() === 'under_review' && subStatus.includes('waiting_for_patch')) {
    const blockerCode = 'marketplace_waiting_for_patch';
    return {
      blockerCode,
      blockerMessage: 'Marketplace listing is under review and waiting for patch.',
      nextAction: deriveNextActionFromBlocker(blockerCode, params.marketplace),
    };
  }

  if (String(params.localListingState || '').trim().toLowerCase() === 'failed_publish') {
    const blockerCode = 'listing_failed_publish';
    return {
      blockerCode,
      blockerMessage: 'The last local publish/reconciliation state is failed_publish.',
      nextAction: deriveNextActionFromBlocker(blockerCode, params.marketplace),
    };
  }

  if (String(params.externalMarketplaceState || '').trim().toLowerCase() === 'paused') {
    const blockerCode = 'listing_paused';
    return {
      blockerCode,
      blockerMessage: 'Marketplace listing is paused and not sale-ready.',
      nextAction: deriveNextActionFromBlocker(blockerCode, params.marketplace),
    };
  }

  const firstBlockedReason = params.validationBlockedReasons[0] || null;
  if (firstBlockedReason) {
    return {
      blockerCode: firstBlockedReason,
      blockerMessage: `Validation blocker: ${firstBlockedReason}.`,
      nextAction: deriveNextActionFromBlocker(firstBlockedReason, params.marketplace),
    };
  }

  const packApproved = params.metadata?.mlChileAssetPack?.packApproved;
  const reviewedProofState = firstNonEmptyString(params.metadata?.mlChileImageRemediation?.reviewedProofState);
  if (packApproved === false || reviewedProofState === 'pending_real_files') {
    const blockerCode = 'ml_image_pack_not_approved';
    return {
      blockerCode,
      blockerMessage: 'MercadoLibre image asset pack is not yet approved for trustworthy listing use.',
      nextAction: deriveNextActionFromBlocker(blockerCode, params.marketplace),
    };
  }

  return { blockerCode: null, blockerMessage: null, nextAction: null };
}

function buildAgentTrace(metadata: Record<string, any>, blockerNextAction: string | null): OperationsTruthAgentTrace | null {
  const remediation = metadata.mlChileImageRemediation || null;
  const optimization = metadata.marketplaceOptimizationAdvisory || null;

  const remediationAt = parseIsoDate(remediation?.checkedAt);
  const optimizationAt = parseIsoDate(optimization?.analyzedAt);
  const useRemediation = remediationAt > 0 && remediationAt >= optimizationAt;

  if (useRemediation && remediation) {
    const evidence = [
      ...((Array.isArray(remediation.blockingReasons) ? remediation.blockingReasons : []).map((value: unknown) => String(value))),
      ...((Array.isArray(remediation.rawAuditSummary?.hardBlockers) ? remediation.rawAuditSummary.hardBlockers : []).map((value: unknown) => String(value))),
    ].filter(Boolean).slice(0, 4);
    return {
      agentName: 'ml_image_remediation_pipeline',
      stage: 'image_remediation',
      decision: firstNonEmptyString(remediation.decision, remediation.remediationPathSelected, remediation.reviewedProofState) || 'unknown',
      reasonCode: firstNonEmptyString(remediation.blockingReasons?.[0], remediation.rawAuditSummary?.status, remediation.reviewedProofState) || 'unknown',
      evidenceSummary: evidence.length > 0 ? evidence : ['No remediation evidence summary available.'],
      blocking: remediation.publishSafe === false,
      advisory: false,
      nextAction: blockerNextAction || (remediation.publishSafe ? 'Use approved assets for marketplace replacement.' : 'Regenerate or review the ML asset pack.'),
      decidedAt: toIsoOrNull(remediation.checkedAt),
    };
  }

  if (optimization) {
    const firstRecommendation = Array.isArray(optimization.recommendations) ? optimization.recommendations[0] : null;
    return {
      agentName: 'marketplace_optimization_agent',
      stage: 'marketplace_optimization',
      decision: firstNonEmptyString(optimization.advisoryState) || 'unknown',
      reasonCode: firstNonEmptyString(firstRecommendation?.type) || 'optimization_scan',
      evidenceSummary: Array.isArray(firstRecommendation?.evidence) && firstRecommendation.evidence.length > 0
        ? firstRecommendation.evidence.map((value: unknown) => String(value)).slice(0, 4)
        : [`compliance=${String(optimization.scores?.compliance ?? 'n/a')}`, `visibility=${String(optimization.scores?.visibility ?? 'n/a')}`],
      blocking: false,
      advisory: true,
      nextAction: blockerNextAction || firstRecommendation?.reason || null,
      decidedAt: toIsoOrNull(optimization.analyzedAt),
    };
  }

  return null;
}

export async function buildOperationsTruthBundle(params: BuildOperationsTruthParams): Promise<OperationsTruthBundle> {
  const limit = Math.max(1, Math.min(params.limit ?? 12, 50));
  const productIds = Array.isArray(params.productIds) ? params.productIds.filter((value) => Number.isFinite(value)) : [];
  const saleWhere = params.environment === 'all' || !params.environment ? {} : { environment: params.environment };

  const productWhere = productIds.length > 0
    ? {
        ...(params.userId != null ? { userId: params.userId } : {}),
        id: { in: productIds },
      }
    : {
        ...(params.userId != null ? { userId: params.userId } : {}),
      };

  const products = await prisma.product.findMany({
    where: productWhere,
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      isPublished: true,
      category: true,
      images: true,
      productData: true,
      finalPrice: true,
      suggestedPrice: true,
      targetCountry: true,
      shippingCost: true,
      totalCost: true,
      currency: true,
      aliexpressPrice: true,
      aliexpressSku: true,
      createdAt: true,
      marketplaceListings: {
        select: {
          id: true,
          marketplace: true,
          listingId: true,
          listingUrl: true,
          status: true,
          publishedAt: true,
          updatedAt: true,
          lastReconciledAt: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: productIds.length > 0 ? productIds.length : limit,
  });

  const relevantProducts = productIds.length > 0
    ? products.sort((a, b) => productIds.indexOf(a.id) - productIds.indexOf(b.id))
    : products;

  const relevantProductIds = relevantProducts.map((product) => product.id);

  const [orders, sales] = await Promise.all([
    relevantProductIds.length > 0
      ? prisma.order.findMany({
          where: { productId: { in: relevantProductIds } },
          select: {
            id: true,
            productId: true,
            status: true,
            paypalOrderId: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([]),
    relevantProductIds.length > 0
      ? prisma.sale.findMany({
          where: { productId: { in: relevantProductIds }, ...saleWhere },
          select: {
            id: true,
            productId: true,
            status: true,
            trackingNumber: true,
            payoutExecuted: true,
            netProfit: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const latestOrderByProduct = new Map<number, (typeof orders)[number]>();
  for (const order of orders) {
    if (order.productId != null && !latestOrderByProduct.has(order.productId)) {
      latestOrderByProduct.set(order.productId, order);
    }
  }

  const latestSaleByProduct = new Map<number, (typeof sales)[number]>();
  for (const sale of sales) {
    if (!latestSaleByProduct.has(sale.productId)) {
      latestSaleByProduct.set(sale.productId, sale);
    }
  }

  const mlListings = relevantProducts
    .flatMap((product) => product.marketplaceListings.map((listing) => ({ userId: product.userId, ...listing })))
    .filter((listing) => String(listing.marketplace || '').toLowerCase() === 'mercadolibre');

  const mlStatusByListingId = new Map<string, { mlStatus: string | null; mlSubStatus?: string[] }>();
  if (params.userId != null && mlListings.length > 0) {
    try {
      const marketplaceService = new MarketplaceService();
      const liveStatuses = await marketplaceService.getMlListingsStatus(params.userId, Math.min(Math.max(mlListings.length, 1), 50));
      for (const status of liveStatuses) {
        mlStatusByListingId.set(status.listingId, {
          mlStatus: status.mlStatus,
          mlSubStatus: status.mlSubStatus,
        });
      }
    } catch {
      // Fail closed to database/local listing truth when live marketplace state is unavailable.
    }
  }

  const items = relevantProducts.map<OperationsTruthItem>((product) => {
    const metadata = parseMetadata(product.productData);
    const validation = getProductValidationSnapshot(product as any);
    const latestListing = product.marketplaceListings[0] ?? null;
    const latestOrder = latestOrderByProduct.get(product.id) ?? null;
    const latestSale = latestSaleByProduct.get(product.id) ?? null;
    const marketplace = firstNonEmptyString(latestListing?.marketplace)?.toLowerCase() || null;
    const listingId = firstNonEmptyString(latestListing?.listingId);
    const liveMl = listingId ? mlStatusByListingId.get(listingId) : undefined;
    const externalMarketplaceState = firstNonEmptyString(
      liveMl?.mlStatus,
      latestListing?.status,
      product.isPublished ? 'active' : null
    );
    const externalMarketplaceSubStatus = Array.isArray(liveMl?.mlSubStatus)
      ? liveMl!.mlSubStatus!.map((value) => String(value))
      : [];
    const localListingState = firstNonEmptyString(latestListing?.status, product.status);
    const imageRemediationState = firstNonEmptyString(
      metadata.mlChileImageCompliance?.status,
      metadata.mlChileImageRemediation?.reviewedProofState
    );
    const publicationReadinessState = firstNonEmptyString(validation.validationState, product.status);

    const blocker = deriveBlocker({
      externalMarketplaceState,
      externalMarketplaceSubStatus,
      localListingState,
      validationBlockedReasons: validation.blockedReasons || [],
      metadata,
      marketplace,
    });

    const orderIngested = Boolean(latestOrder);
    const supplierPurchaseProved = Boolean(
      latestOrder?.status === 'PURCHASED' ||
      latestSale?.trackingNumber ||
      ['SHIPPED', 'DELIVERED', 'COMPLETED'].includes(String(latestSale?.status || '').toUpperCase())
    );
    const trackingAttached = Boolean(latestSale?.trackingNumber);
    const deliveredTruthObtained = ['DELIVERED', 'COMPLETED'].includes(String(latestSale?.status || '').toUpperCase());
    const releasedFundsObtained = latestSale?.payoutExecuted === true;
    const realizedProfitObtained = releasedFundsObtained && Number(latestSale?.netProfit ?? 0) > 0;
    const proofUpdatedAt = toIsoOrNull(latestSale?.updatedAt || latestOrder?.updatedAt || latestListing?.lastReconciledAt || latestListing?.updatedAt);

    const agentTrace = buildAgentTrace(metadata, blocker.nextAction);

    return {
      productId: product.id,
      productTitle: product.title,
      marketplace,
      listingId,
      localListingState,
      externalMarketplaceState,
      externalMarketplaceSubStatus,
      listingUrl: firstNonEmptyString(latestListing?.listingUrl),
      lastMarketplaceSyncAt: toIsoOrNull(latestListing?.lastReconciledAt || latestListing?.updatedAt),
      imageRemediationState,
      publicationReadinessState,
      blockerCode: blocker.blockerCode,
      blockerMessage: blocker.blockerMessage,
      nextAction: blocker.nextAction,
      orderIngested,
      supplierPurchaseProved,
      trackingAttached,
      deliveredTruthObtained,
      releasedFundsObtained,
      realizedProfitObtained,
      proofUpdatedAt,
      lastAgentDecision: agentTrace?.decision ?? null,
      lastAgentDecisionReason: agentTrace?.reasonCode ?? null,
      decidedAt: agentTrace?.decidedAt ?? null,
      sourceLabels: {
        listing: liveMl ? 'live_marketplace_api' : 'marketplace_listing_row',
        blocker: blocker.blockerCode ? 'derived_operations_truth' : 'no_current_blocker',
        proof: 'orders_and_sales_tables',
        agent: agentTrace ? 'product_metadata_patch' : 'missing_agent_trace',
      },
      agentTrace,
    };
  });

  const liveStateCounts = items.reduce(
    (acc, item) => {
      acc[normalizeLiveState(item.externalMarketplaceState)] += 1;
      return acc;
    },
    { active: 0, under_review: 0, paused: 0, failed_publish: 0, unknown: 0 }
  );

  const blockerMap = new Map<string, number>();
  for (const item of items) {
    if (!item.blockerCode) continue;
    blockerMap.set(item.blockerCode, (blockerMap.get(item.blockerCode) || 0) + 1);
  }

  const proofCounts = items.reduce(
    (acc, item) => {
      if (item.orderIngested) acc.orderIngested += 1;
      if (item.supplierPurchaseProved) acc.supplierPurchaseProved += 1;
      if (item.trackingAttached) acc.trackingAttached += 1;
      if (item.deliveredTruthObtained) acc.deliveredTruthObtained += 1;
      if (item.releasedFundsObtained) acc.releasedFundsObtained += 1;
      if (item.realizedProfitObtained) acc.realizedProfitObtained += 1;
      return acc;
    },
    {
      orderIngested: 0,
      supplierPurchaseProved: 0,
      trackingAttached: 0,
      deliveredTruthObtained: 0,
      releasedFundsObtained: 0,
      realizedProfitObtained: 0,
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    items,
    summary: {
      liveStateCounts,
      blockerCounts: Array.from(blockerMap.entries())
        .map(([blockerCode, count]) => ({ blockerCode, count }))
        .sort((a, b) => b.count - a.count),
      proofCounts,
    },
  };
}
