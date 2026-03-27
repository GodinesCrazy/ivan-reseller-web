/**
 * P89 — Canonical web preflight contract for Mercado Libre publication (reusable per product).
 */

import { env } from '../config/env';
import { MarketplaceService } from './marketplace.service';
import { productService } from './product.service';
import type { PrePublishProductShape } from './pre-publish-validator.service';
import { runPreventiveEconomicsCore } from './pre-publish-validator.service';
import { resolveMercadoLibrePublishImageInputs } from './mercadolibre-image-remediation.service';
import { getMarketplaceContext } from './marketplace-context.service';
import { getConnectorReadinessForUser, getWebhookStatus } from './webhook-readiness.service';
import {
  mlcCanonicalPricingFromEconomicsCore,
  type MlcCanonicalPricingAssessment,
} from './mlc-canonical-pricing.service';

export type PublishPreflightOverallState =
  | 'ready_to_publish'
  | 'blocked_images'
  | 'blocked_pricing'
  | 'blocked_language'
  | 'blocked_marketplace_connection'
  | 'blocked_credentials'
  | 'blocked_postsale_readiness'
  | 'blocked_missing_source_data'
  | 'blocked_product_status';

/** E2E canary — heuristic rank for “safest first real publish” (same gates as preflight). */
export type MercadoLibreCanaryTier = 'recommended' | 'acceptable' | 'risky' | 'blocked';

export interface MercadoLibreCanaryAssessment {
  tier: MercadoLibreCanaryTier;
  /** 0–100; higher = more suitable for a first real web canary publish. */
  score: number;
  reasons: string[];
}

export interface MercadoLibrePublishPreflightPayload {
  schemaVersion: 1;
  marketplace: 'mercadolibre';
  productId: number;
  overallState: PublishPreflightOverallState;
  publishAllowed: boolean;
  /** Canary suitability for end-to-end dropshipping test (admin product picker). */
  canary: MercadoLibreCanaryAssessment;
  nextAction: string;
  blockers: string[];
  warnings: string[];
  productStatus: string | null;
  listingSalePriceUsd: number;
  canonicalPricing: MlcCanonicalPricingAssessment;
  images: {
    publishSafe: boolean;
    blockingReason?: string | null;
    imageCount: number;
    /** P97: required MLC pack slots for publish gate */
    packApproved: boolean;
    requiredAssets: Array<{
      assetKey: string;
      approvalState: string;
      exists: boolean;
      localPath: string | null;
      min1200: boolean | null;
      squareLike: boolean | null;
      notes: string | null;
    }>;
  };
  language: {
    supported: boolean;
    country: string;
    resolvedLanguage: string;
    requiredLanguage: string;
    reason?: string;
  };
  credentials: {
    present: boolean;
    active: boolean;
    issues: string[];
  };
  mercadoLibreApi: {
    testConnectionOk: boolean;
    /** Same path as MarketplaceService.testConnection (incl. refresh-on-401) */
    testConnectionMessage?: string;
    credentialEnvironment: 'sandbox' | 'production';
  };
  postsale: {
    mercadolibreWebhookConfigured: boolean;
    mercadolibreEventFlowReady: boolean;
    mercadolibreConnectorAutomationReady: boolean;
    mercadolibreOperationMode: string;
    fulfillPrerequisiteAliExpressUrl: boolean;
    verificationNotes: string[];
  };
}

function toPrePublishShape(row: Record<string, unknown>): PrePublishProductShape {
  return {
    id: Number(row.id),
    title: (row.title as string) || undefined,
    category: (row.category as string) || undefined,
    images: row.images,
    productData: row.productData,
    aliexpressUrl: String(row.aliexpressUrl || ''),
    aliexpressSku: (row.aliexpressSku as string) || null,
    aliexpressPrice: row.aliexpressPrice,
    importTax: row.importTax,
    currency: (row.currency as string) || null,
    targetCountry: (row.targetCountry as string) || null,
    originCountry: (row.originCountry as string) || null,
    shippingCost: row.shippingCost,
  };
}

export function resolveMercadoLibrePreflightOverallState(checks: {
  productStatusOk: boolean;
  hasAliUrl: boolean;
  credentialsOk: boolean;
  mlApiOk: boolean;
  languageOk: boolean;
  imagesOk: boolean;
  pricingOk: boolean;
  postsaleOk: boolean;
}): PublishPreflightOverallState {
  if (!checks.productStatusOk) return 'blocked_product_status';
  if (!checks.hasAliUrl) return 'blocked_missing_source_data';
  if (!checks.credentialsOk) return 'blocked_credentials';
  if (!checks.mlApiOk) return 'blocked_marketplace_connection';
  if (!checks.languageOk) return 'blocked_language';
  if (!checks.imagesOk) return 'blocked_images';
  if (!checks.pricingOk) return 'blocked_pricing';
  if (!checks.postsaleOk) return 'blocked_postsale_readiness';
  return 'ready_to_publish';
}

/**
 * Derives a canary score from the same truthful preflight payload shown in the admin UI.
 * Not a substitute for gates: `publishAllowed` still controls actual publish.
 */
export function computeMercadoLibreCanaryAssessment(
  p: Omit<MercadoLibrePublishPreflightPayload, 'canary'>
): MercadoLibreCanaryAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (p.publishAllowed) {
    score += 42;
    reasons.push('all_preflight_gates_pass');
  } else {
    reasons.push(`blocked_state:${p.overallState}`);
  }

  if (p.images.publishSafe) {
    score += 22;
    reasons.push('images_publish_safe');
  } else {
    reasons.push('images_not_publish_safe');
  }

  if (p.canonicalPricing.ok === true) {
    score += 16;
    const net = p.canonicalPricing.profitabilityUsd?.netProfitUsd;
    if (typeof net === 'number' && net > 0) {
      score += 4;
      reasons.push('positive_net_profit_usd');
    } else {
      reasons.push('pricing_ok_but_non_positive_net_profit');
    }
  } else {
    reasons.push('canonical_pricing_not_ok');
  }

  if (p.postsale.mercadolibreWebhookConfigured) {
    score += 8;
    reasons.push('ml_webhook_secret_configured');
  } else {
    reasons.push('ml_webhook_secret_missing_or_not_required');
  }

  if (p.postsale.mercadolibreConnectorAutomationReady) {
    score += 5;
    reasons.push('ml_connector_automation_ready');
  } else {
    reasons.push('ml_connector_automation_not_ready');
  }

  if (p.postsale.mercadolibreEventFlowReady) {
    score += 3;
    reasons.push('ml_event_flow_verified');
  } else {
    reasons.push('ml_event_flow_not_verified');
  }

  if (p.warnings.length > 2) {
    score -= 6;
    reasons.push('multiple_preflight_warnings');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier: MercadoLibreCanaryTier = 'blocked';
  if (!p.publishAllowed) {
    tier = 'blocked';
  } else if (
    score >= 88 &&
    p.images.publishSafe &&
    p.canonicalPricing.ok === true &&
    p.postsale.mercadolibreWebhookConfigured &&
    (p.canonicalPricing.profitabilityUsd?.netProfitUsd ?? 0) > 0
  ) {
    tier = 'recommended';
  } else if (score >= 62) {
    tier = 'acceptable';
  } else {
    tier = 'risky';
  }

  return { tier, score, reasons };
}

export async function buildMercadoLibrePublishPreflight(params: {
  userId: number;
  productId: number;
  isAdmin: boolean;
  environment?: 'sandbox' | 'production';
}): Promise<MercadoLibrePublishPreflightPayload> {
  const { userId, productId, isAdmin } = params;
  const marketplaceService = new MarketplaceService();

  const row = await productService.getProductById(productId, userId, isAdmin);
  const product = toPrePublishShape(row as Record<string, unknown>);

  const blockers: string[] = [];
  const warnings: string[] = [];

  const statusOk = row.status === 'VALIDATED_READY';
  if (!statusOk) {
    blockers.push(`product_status:${String(row.status)} (required VALIDATED_READY)`);
  }

  const hasAliUrl = Boolean(product.aliexpressUrl && product.aliexpressUrl.startsWith('http'));
  if (!hasAliUrl) {
    blockers.push('missing_aliexpress_url');
  }

  let userEnvironment: 'sandbox' | 'production' = 'production';
  if (params.environment) {
    userEnvironment = params.environment;
  } else {
    const { workflowConfigService } = await import('./workflow-config.service');
    userEnvironment = await workflowConfigService.getUserEnvironment(userId);
  }

  const credentials = await marketplaceService.getCredentials(userId, 'mercadolibre', userEnvironment);
  const credentialsOk = Boolean(credentials?.isActive && !credentials?.issues?.length);
  if (!credentials) {
    blockers.push('mercadolibre_credentials_missing');
  } else if (!credentials.isActive) {
    blockers.push('mercadolibre_credentials_inactive');
  } else if (credentials.issues?.length) {
    blockers.push(...credentials.issues.map((i) => `credential_issue:${i}`));
  }

  let mlApiOk = false;
  let mlTestConnectionMessage: string | undefined;
  try {
    const tc = await marketplaceService.testConnection(userId, 'mercadolibre', userEnvironment);
    mlApiOk = tc.success;
    mlTestConnectionMessage = tc.message;
  } catch (e) {
    mlApiOk = false;
    mlTestConnectionMessage = e instanceof Error ? e.message : String(e);
  }
  if (!mlApiOk && credentialsOk) {
    blockers.push('mercadolibre_test_connection_failed');
  }

  const listingSalePriceUsd = marketplaceService.getEffectiveListingPrice(row, undefined);

  const ctx = getMarketplaceContext('mercadolibre', credentials?.credentials as Record<string, unknown>);
  const languageOk = ctx.languageSupported === true;
  if (!languageOk) {
    blockers.push(`language:${ctx.languageBlockReason || 'unsupported_or_unresolved'}`);
  }

  const imageResolution = await resolveMercadoLibrePublishImageInputs({
    userId,
    productId,
    title: product.title || '',
    images: product.images,
    productData: product.productData,
  });
  const requiredAssetRows = imageResolution.remediation.assetPack.assets
    .filter((a) => a.assetKey === 'cover_main' || a.assetKey === 'detail_mount_interface')
    .map((a) => ({
      assetKey: a.assetKey,
      approvalState: a.approvalState,
      exists: a.exists,
      localPath: a.localPath,
      min1200: a.min1200,
      squareLike: a.squareLike,
      notes: a.notes,
    }));
  const imagesOk = imageResolution.publishSafe === true;
  if (!imagesOk) {
    blockers.push(`images:${imageResolution.blockingReason || 'not_publish_safe'}`);
  }

  const assertParams = {
    userId,
    product,
    marketplace: 'mercadolibre' as const,
    credentials: credentials?.credentials as Record<string, unknown> | undefined,
    listingSalePrice: listingSalePriceUsd,
  };

  const econCore =
    statusOk && hasAliUrl && credentialsOk && listingSalePriceUsd > 0
      ? await runPreventiveEconomicsCore(assertParams)
      : ({
          ok: false as const,
          message:
            listingSalePriceUsd <= 0
              ? 'listing sale price is missing or invalid'
              : !hasAliUrl
                ? 'missing AliExpress URL'
                : !credentialsOk
                  ? 'mercadolibre credentials not ready'
                  : 'product not in VALIDATED_READY',
        });
  const pricingOk = econCore.ok === true;
  if (econCore.ok === false) {
    blockers.push(`pricing:${econCore.message}`);
  }

  const canonicalPricing = mlcCanonicalPricingFromEconomicsCore(listingSalePriceUsd, econCore);

  const connectorSummary = await getConnectorReadinessForUser(userId);
  const mlConn = connectorSummary.connectors.mercadolibre;
  const wh = getWebhookStatus().mercadolibre;
  const webhookConfigured = wh.configured === true;

  const strictPostsale = env.ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET === true;
  const postsaleOk =
    hasAliUrl &&
    (!strictPostsale || webhookConfigured);

  if (strictPostsale && !webhookConfigured) {
    blockers.push('postsale:WEBHOOK_SECRET_MERCADOLIBRE_not_configured');
  }

  if (!mlConn.eventFlowReady) {
    warnings.push(
      'mercadolibre_webhook_event_flow_not_verified: order automation may require manual reconciliation until an inbound webhook event is proven'
    );
  }
  if (!mlConn.automationReady) {
    warnings.push(`mercadolibre_connector:${mlConn.operationMode} — ${mlConn.issues.join('; ') || 'see connector readiness'}`);
  }

  const overallState = resolveMercadoLibrePreflightOverallState({
    productStatusOk: statusOk,
    hasAliUrl,
    credentialsOk,
    mlApiOk,
    languageOk,
    imagesOk,
    pricingOk,
    postsaleOk,
  });

  const publishAllowed = overallState === 'ready_to_publish';

  let nextAction = 'Use Intelligent Publisher approve flow or POST /api/marketplace/publish when all checks pass.';
  if (!statusOk) nextAction = 'Move product to VALIDATED_READY in the preventive validation workflow.';
  else if (!hasAliUrl) nextAction = 'Attach a valid AliExpress supplier URL.';
  else if (!credentialsOk) nextAction = 'Configure Mercado Libre OAuth credentials in API settings.';
  else if (!mlApiOk) nextAction = 'Refresh Mercado Libre token or fix API credentials; test connection from settings.';
  else if (!languageOk) nextAction = 'Fix listing language / site (MLC requires Spanish listing context for CL).';
  else if (!imagesOk) nextAction = 'Complete ML image remediation until publishSafe is true.';
  else if (!pricingOk)
    nextAction = `Fix pricing or economics: ${econCore.ok === false ? econCore.message : ''}`;
  else if (!postsaleOk) nextAction = 'Set WEBHOOK_SECRET_MERCADOLIBRE (or disable ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET for non-production tests).';

  const verificationNotes = [
    `webhook_secret_configured:${webhookConfigured}`,
    `webhook_proof_level:${connectorSummary.webhookStatus.mercadolibre.proofLevel ?? 'unknown'}`,
    `event_flow_ready:${connectorSummary.webhookStatus.mercadolibre.eventFlowReady === true}`,
    `inbound_event_seen:${connectorSummary.webhookStatus.mercadolibre.inboundEventSeen === true}`,
    'fulfill_path: auto_purchase_and_supplier_order require AliExpress dropshipping credentials and runtime order ingestion (verify separately).',
  ];

  const base: Omit<MercadoLibrePublishPreflightPayload, 'canary'> = {
    schemaVersion: 1,
    marketplace: 'mercadolibre',
    productId,
    overallState,
    publishAllowed,
    nextAction,
    blockers,
    warnings,
    productStatus: row.status as string,
    listingSalePriceUsd,
    canonicalPricing,
    images: {
      publishSafe: imageResolution.publishSafe,
      blockingReason: imageResolution.blockingReason ?? null,
      imageCount: imageResolution.images?.length ?? 0,
      packApproved: imageResolution.remediation.assetPack.packApproved,
      requiredAssets: requiredAssetRows,
    },
    language: {
      supported: languageOk,
      country: ctx.country,
      resolvedLanguage: String(ctx.destination.language || '').toLowerCase(),
      requiredLanguage: ctx.requiredLanguage,
      reason: ctx.languageBlockReason,
    },
    credentials: {
      present: Boolean(credentials),
      active: Boolean(credentials?.isActive),
      issues: credentials?.issues ?? [],
    },
    mercadoLibreApi: {
      testConnectionOk: mlApiOk,
      testConnectionMessage: mlTestConnectionMessage,
      credentialEnvironment: userEnvironment,
    },
    postsale: {
      mercadolibreWebhookConfigured: webhookConfigured,
      mercadolibreEventFlowReady: connectorSummary.webhookStatus.mercadolibre.eventFlowReady === true,
      mercadolibreConnectorAutomationReady: mlConn.automationReady,
      mercadolibreOperationMode: mlConn.operationMode,
      fulfillPrerequisiteAliExpressUrl: hasAliUrl,
      verificationNotes,
    },
  };

  return {
    ...base,
    canary: computeMercadoLibreCanaryAssessment(base),
  };
}
