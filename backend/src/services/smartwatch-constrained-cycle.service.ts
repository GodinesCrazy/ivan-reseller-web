/**
 * Autonomous constrained cycle: smartwatch → MercadoLibre Chile, real APIs, profit gates.
 * Stages 1–8 (publish + verify listing). Stages 9–15 documented for operators (buyer, fulfillment, profit API).
 */

import { prisma } from '../config/database';
import { trendsService } from './trends.service';
import opportunityFinder from './opportunity-finder.service';
import { ProductService } from './product.service';
import MarketplaceService, { type PublishProductRequest } from './marketplace.service';
import { workflowConfigService } from './workflow-config.service';
import { CredentialsManager } from './credentials-manager.service';
import {
  evaluatePrePublishValidation,
  type PrePublishEvaluationResult,
} from './pre-publish-validator.service';
import { runActiveListingsRiskScan } from './active-listings-risk-scan.service';
import type { OpportunityItem } from './opportunity-finder.types';
import logger from '../config/logger';
import { isSmartwatchTitleForConstrainedCycle } from './smartwatch-constrained-cycle.utils';

const EBAY_MIN_IMAGE = 500;
const FALLBACK_IMAGE = `https://placehold.co/${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.png`;

/** Supplier product (unit) max USD (Stage 2) */
const MAX_SUPPLIER_PRODUCT_USD = 10;
/** Supplier unit + API shipping to destination max USD (Stages 2–3) */
const MAX_SUPPLIER_PLUS_SHIPPING_USD = 15;
/** Minimum net margin vs sale price for this QA cycle (Stage 4–5) */
const MIN_MARGIN_RATIO_QA = 0.15;
/** Listing price multipliers to try after affiliate suggested price */
const LISTING_PRICE_MULTIPLIERS = [1, 1.1, 1.2, 1.35, 1.5, 1.65, 1.8] as const;

function enlargeImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim();
  u = u.replace(/placehold\.co\/(\d+)x(\d+)/i, (_, w, h) => {
    const s = Math.max(EBAY_MIN_IMAGE, parseInt(w, 10) || EBAY_MIN_IMAGE, parseInt(h, 10) || EBAY_MIN_IMAGE);
    return `placehold.co/${s}x${s}`;
  });
  u = u.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, `_${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.$1`);
  u = u.replace(/\.(jpg|jpeg|png|webp|gif)_[0-9]+x[0-9]+\.\1$/i, `_${EBAY_MIN_IMAGE}x${EBAY_MIN_IMAGE}.$1`);
  return u;
}

export interface SmartwatchConstrainedCycleParams {
  userId: number;
  /** Solo Stage 1–2: sin crear producto ni publicar */
  dryRun?: boolean;
  /** Crear producto, validar con pre-publish, no publicar en ML */
  validateOnly?: boolean;
  /** Entorno credenciales ML (mismo patrón que otros internals) */
  credentialEnvironment?: 'sandbox' | 'production';
}

export interface SmartwatchConstrainedCycleResult {
  success: boolean;
  stoppedAt?: string;
  message?: string;
  stages: Record<string, unknown>;
  userId: number;
  /** Producto creado / usado */
  productId?: number;
  listingId?: string;
  listingUrl?: string;
  prePublish?: PrePublishEvaluationResult;
  opportunity?: Pick<OpportunityItem, 'title' | 'aliexpressUrl' | 'costUsd' | 'suggestedPriceUsd'>;
  durationMs: number;
}

async function markRejected(productId: number, userId: number, reason: string): Promise<void> {
  try {
    const ps = new ProductService();
    await ps.updateProductStatusSafely(productId, 'REJECTED', userId, `Smartwatch cycle: ${reason.slice(0, 200)}`);
  } catch (e: any) {
    logger.warn('[SMARTWATCH-CYCLE] markRejected failed', { productId, error: e?.message });
  }
}

export async function runSmartwatchMlcConstrainedCycle(
  params: SmartwatchConstrainedCycleParams
): Promise<SmartwatchConstrainedCycleResult> {
  const t0 = Date.now();
  const { userId, dryRun, validateOnly } = params;
  const stages: Record<string, unknown> = {};

  let env: 'sandbox' | 'production' = await workflowConfigService.getUserEnvironment(userId);
  if (params.credentialEnvironment === 'production' || params.credentialEnvironment === 'sandbox') {
    env = params.credentialEnvironment;
  }

  // —— Stage 1: active listings + DS + ML ——
  const activeCount = await prisma.marketplaceListing.count({
    where: { userId, status: 'active' },
  });
  stages.stage1_activeListingsUser = activeCount;
  if (activeCount > 0) {
    return {
      success: false,
      stoppedAt: 'stage1',
      message: `Hay ${activeCount} publicación(es) activa(s) para userId=${userId}. Cero para test seguro.`,
      stages,
      userId,
      durationMs: Date.now() - t0,
    };
  }

  const riskDry = await runActiveListingsRiskScan({ userId, dryRun: true, writeFlags: false });
  stages.stage1_riskScanDry = { scanned: riskDry.scanned, summary: riskDry.summary };

  const dsRaw = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
  const dsOk = !!(dsRaw && String((dsRaw as { accessToken?: string }).accessToken || '').trim());
  stages.stage1_dropshippingConnected = dsOk;
  if (!dsOk) {
    return {
      success: false,
      stoppedAt: 'stage1',
      message: 'AliExpress Dropshipping API no conectada (sin accessToken en producción).',
      stages,
      userId,
      durationMs: Date.now() - t0,
    };
  }

  const ms = new MarketplaceService();
  const mlCreds = await ms.getCredentials(userId, 'mercadolibre', env);
  const mlOk = !!(mlCreds?.isActive && !mlCreds.issues?.length);
  stages.stage1_mercadolibreReady = mlOk;
  if (!mlOk) {
    return {
      success: false,
      stoppedAt: 'stage1',
      message:
        mlCreds?.issues?.join('; ') ||
        'Mercado Libre: credenciales no listas para publicar (revisa OAuth / entorno).',
      stages,
      userId,
      durationMs: Date.now() - t0,
    };
  }

  // —— Stage 2: Trend (información) + Research ——
  let trendKeywords: { keyword: string }[] = [];
  try {
    trendKeywords = await trendsService.getTrendingKeywords({
      region: 'US',
      maxKeywords: 20,
      userId,
    });
  } catch (e: any) {
    stages.stage2_trendsError = e?.message || String(e);
  }
  const smartwatchTrendHits = trendKeywords.filter((k) => isSmartwatchTitleForConstrainedCycle(k.keyword));
  stages.stage2_trendsSample = trendKeywords.slice(0, 8).map((k) => k.keyword);
  stages.stage2_smartwatchTrendHits = smartwatchTrendHits.map((k) => k.keyword);

  const researchQuery = 'smart watch';
  const discovery = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
    query: researchQuery,
    maxItems: 30,
    skipTrendsValidation: true,
    marketplaces: ['mercadolibre'],
    region: 'us',
  });
  stages.stage2_discovery = {
    success: discovery.success,
    count: discovery.opportunities.length,
    diagnostics: discovery.diagnostics,
  };

  const filtered = discovery.opportunities.filter((o) => {
    const cost = Number(o.costUsd ?? 0);
    if (!isSmartwatchTitleForConstrainedCycle(o.title || '')) return false;
    if (!(cost > 0 && cost <= MAX_SUPPLIER_PRODUCT_USD)) return false;
    const url = o.aliexpressUrl || o.productUrl || '';
    return typeof url === 'string' && /aliexpress\.com/i.test(url);
  });
  filtered.sort((a, b) => Number(a.costUsd) - Number(b.costUsd));
  stages.stage2_candidatesAfterFilter = filtered.length;

  if (filtered.length === 0) {
    return {
      success: false,
      stoppedAt: 'stage2',
      message:
        'No hay candidatos smartwatch con coste ≤ 10 USD y URL AliExpress tras el research real.',
      stages,
      userId,
      durationMs: Date.now() - t0,
    };
  }

  if (dryRun) {
    const preview = filtered.slice(0, 5).map((o) => ({
      title: o.title,
      costUsd: o.costUsd,
      suggestedPriceUsd: o.suggestedPriceUsd,
      aliexpressUrl: o.aliexpressUrl,
    }));
    return {
      success: true,
      stoppedAt: 'dryRun',
      message: 'Dry-run: Stage 1–2 OK. Candidatos listados; sin crear producto.',
      stages: { ...stages, stage2_preview: preview },
      userId,
      durationMs: Date.now() - t0,
    };
  }

  // —— Stages 3–6: crear producto, pre-publish SAFE, supplier+ship caps ——
  const productService = new ProductService();
  const mlCredRecord = mlCreds.credentials as Record<string, unknown>;

  for (const opp of filtered) {
    const rawImages = Array.isArray(opp.images)
      ? opp.images
      : opp.image
        ? [opp.image]
        : [];
    const imgs = rawImages
      .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
      .map(enlargeImageUrl);
    const imageUrls = imgs.length > 0 ? imgs.slice(0, 12) : [FALLBACK_IMAGE];

    let productId: number;
    try {
      const p = await productService.createProduct(userId, {
        title: opp.title,
        description: (opp as any).description || 'Smartwatch — ciclo autónomo QA MLC',
        aliexpressUrl: opp.aliexpressUrl || opp.productUrl!,
        aliexpressPrice: opp.costUsd,
        suggestedPrice: opp.suggestedPriceUsd || Number(opp.costUsd) * 1.4,
        imageUrls,
        category: opp.category || 'Electronics',
        currency: 'USD',
        targetCountry: 'CL',
      });
      productId = p.id;
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/Ya existe un producto con la misma URL/i.test(msg)) {
        logger.info('[SMARTWATCH-CYCLE] skip duplicate URL', { title: opp.title?.slice(0, 40) });
        continue;
      }
      stages.lastCreateError = msg;
      continue;
    }

    await productService.updateProductStatusSafely(
      productId,
      'APPROVED',
      userId,
      'Smartwatch QA: aprobación para pre-publish'
    );

    const productRow = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        aliexpressUrl: true,
        aliexpressSku: true,
        aliexpressPrice: true,
        importTax: true,
        currency: true,
        targetCountry: true,
        shippingCost: true,
        suggestedPrice: true,
      },
    });
    if (!productRow) {
      continue;
    }

    const baseSale = Math.max(
      Number(productRow.suggestedPrice || 0),
      Number(productRow.aliexpressPrice || 0) * 1.25
    );

    let chosen: PrePublishEvaluationResult | null = null;
    for (const m of LISTING_PRICE_MULTIPLIERS) {
      const listingSalePrice = Math.round(baseSale * m * 100) / 100;
      if (listingSalePrice <= 0) continue;
      const ev = await evaluatePrePublishValidation({
        userId,
        marketplace: 'mercadolibre',
        credentials: mlCredRecord,
        listingSalePrice,
        ignoreValidationDisabled: true,
        product: {
          id: productRow.id,
          aliexpressUrl: productRow.aliexpressUrl || '',
          aliexpressSku: productRow.aliexpressSku,
          aliexpressPrice: productRow.aliexpressPrice,
          importTax: productRow.importTax,
          currency: productRow.currency,
          targetCountry: productRow.targetCountry || 'CL',
          shippingCost: productRow.shippingCost,
        },
      });

      const sup = ev.supplierUnitUsd ?? 0;
      const ship = ev.shippingUsd ?? 0;
      const marginOk =
        ev.netProfit != null &&
        ev.listingSalePrice > 0 &&
        ev.netProfit / ev.listingSalePrice >= MIN_MARGIN_RATIO_QA;
      const supplierCapsOk =
        sup > 0 &&
        sup <= MAX_SUPPLIER_PRODUCT_USD &&
        sup + ship <= MAX_SUPPLIER_PLUS_SHIPPING_USD;
      const strictSafe = ev.classification === 'SAFE' && !ev.usedShippingFallback;

      if (strictSafe && marginOk && supplierCapsOk) {
        chosen = ev;
        break;
      }
    }

    if (!chosen) {
      await markRejected(productId, userId, 'pre-publish: no SAFE listing price with CL API shipping + margin + cost caps');
      continue;
    }

    if (chosen.aliexpressSkuId) {
      await prisma.product.update({
        where: { id: productId },
        data: { aliexpressSku: chosen.aliexpressSkuId },
      });
    }

    stages.stage3to6_selectedOpportunity = {
      title: opp.title,
      costUsd: opp.costUsd,
      aliexpressUrl: opp.aliexpressUrl,
    };
    stages.stage5_prePublish = chosen;

    // —— Stage 7–8: publish + verify DB listing ——
    if (validateOnly) {
      return {
        success: true,
        stoppedAt: 'validateOnly',
        message: 'Validación OK (SAFE, APIs). Publicación omitida (validateOnly).',
        stages,
        userId,
        productId,
        prePublish: chosen,
        opportunity: {
          title: opp.title,
          aliexpressUrl: opp.aliexpressUrl,
          costUsd: opp.costUsd,
          suggestedPriceUsd: opp.suggestedPriceUsd,
        },
        durationMs: Date.now() - t0,
      };
    }

    const baseTitle = String(productRow.title || opp.title).replace(/\s+/g, ' ').trim();
    let uniqueTitle = `${baseTitle.slice(0, 48)} P${productId}`.replace(/\s+/g, ' ').trim();
    if (uniqueTitle.length > 60) uniqueTitle = uniqueTitle.slice(0, 60).trim();

    let publishResult: { success: boolean; error?: string; listingId?: string; listingUrl?: string };
    try {
      publishResult = await ms.publishProduct(
        userId,
        {
          productId,
          marketplace: 'mercadolibre',
          customData: {
            title: uniqueTitle,
            price: chosen.listingSalePrice,
            quantity: 1,
          } as PublishProductRequest['customData'],
        },
        env
      );
    } catch (e: any) {
      publishResult = { success: false, error: e?.message || String(e) };
    }

    if (!publishResult.success) {
      await markRejected(productId, userId, publishResult.error || 'publish failed');
      return {
        success: false,
        stoppedAt: 'stage7',
        message: publishResult.error || 'Publicación ML fallida',
        stages,
        userId,
        productId,
        prePublish: chosen,
        durationMs: Date.now() - t0,
      };
    }

    const listingRow = await prisma.marketplaceListing.findFirst({
      where: { productId, userId, marketplace: 'mercadolibre' },
      select: { listingId: true, status: true, listingUrl: true },
    });
    stages.stage8_listing = listingRow;

    return {
      success: true,
      message: 'Ciclo autónomo Stages 1–8 completado (publicado en MLC). Stages 9–15: ver documentación.',
      stages,
      userId,
      productId,
      listingId: publishResult.listingId,
      listingUrl: publishResult.listingUrl || listingRow?.listingUrl || undefined,
      prePublish: chosen,
      opportunity: {
        title: opp.title,
        aliexpressUrl: opp.aliexpressUrl,
        costUsd: opp.costUsd,
        suggestedPriceUsd: opp.suggestedPriceUsd,
      },
      durationMs: Date.now() - t0,
    };
  }

  return {
    success: false,
    stoppedAt: 'stage3to6',
    message: 'Ningún candidato pasó validación estricta (CL + stock + SKU + envío API + margen + topes de coste).',
    stages,
    userId,
    durationMs: Date.now() - t0,
  };
}
