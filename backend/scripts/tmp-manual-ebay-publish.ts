#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';
import logger from '../src/config/logger';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import {
  aliexpressDropshippingAPIService,
  refreshAliExpressDropshippingToken,
  type AliExpressDropshippingCredentials,
} from '../src/services/aliexpress-dropshipping-api.service';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import {
  hasValidInternationalTrackingMethod,
  isPreferredEbayUsShippingMethod,
  minShippingCostFromApi,
  selectPurchasableSkuSoft,
} from '../src/services/pre-publish-validator.service';
import { calculateEbayPrice } from '../src/services/marketplace-fee-intelligence.service';
import { enforceEbayImageCompliance } from '../src/services/ebay-image-compliance.service';
import { productService, type CreateProductDto } from '../src/services/product.service';
import MarketplaceService from '../src/services/marketplace.service';
import { workflowConfigService } from '../src/services/workflow-config.service';

const USER_ID = Number(process.env.TEST_USER_ID || '1');
const MIN_RATING = 4.75; // >95%
const TARGET_MARGIN = Math.max(1.01, Number(process.env.EBAY_TARGET_MARGIN_MULTIPLIER || '1.2'));
const KEYWORDS = [
  'phone case',
  'wireless earbuds',
  'usb charger',
  'kitchen organizer',
  'car phone holder',
  'home storage box',
  'plain t shirt',
  'stainless steel spoon',
  'silicone cable organizer',
  'mouse pad',
  'water bottle',
  'kitchen knife',
  'screwdriver set',
  'earrings',
  'keychain',
  'nail clipper',
  'desk lamp',
  'toothbrush holder',
  'soap dispenser',
  'iphone cable',
];

function toRatingFiveStar(evaluateScore?: number, evaluateRate?: number): number | null {
  if (evaluateScore != null && Number.isFinite(evaluateScore)) {
    if (evaluateScore <= 5) return evaluateScore;
    if (evaluateScore <= 100) return evaluateScore / 20;
  }
  if (evaluateRate != null && Number.isFinite(evaluateRate)) {
    if (evaluateRate <= 5) return evaluateRate;
    if (evaluateRate <= 100) return evaluateRate / 20;
  }
  return null;
}

async function configureAffiliate(userId: number): Promise<void> {
  const envAppKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
  const envAppSecret = (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim();
  const trackingId = (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim();

  const envCreds = envAppKey && envAppSecret
    ? { appKey: envAppKey, appSecret: envAppSecret, trackingId, sandbox: false }
    : null;
  const dbCreds = envCreds ?? (await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production'));

  if (!dbCreds || !('appKey' in dbCreds) || !('appSecret' in dbCreds) || !dbCreds.appKey || !dbCreds.appSecret) {
    throw new Error('AliExpress Affiliate credentials missing');
  }

  aliexpressAffiliateAPIService.setCredentials(dbCreds as any);
}

async function configureDropshipping(userId: number): Promise<void> {
  let creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production'
  )) as AliExpressDropshippingCredentials | null;

  if (!creds?.accessToken) {
    creds = (await CredentialsManager.getCredentials(
      userId,
      'aliexpress-dropshipping',
      'sandbox'
    )) as AliExpressDropshippingCredentials | null;
  }

  if (!creds?.appKey || !creds?.appSecret || !creds?.accessToken) {
    throw new Error('AliExpress Dropshipping credentials missing');
  }

  try {
    const refreshed = await refreshAliExpressDropshippingToken(userId, 'production', { minTtlMs: 60_000 });
    if (refreshed.credentials?.accessToken) {
      creds = refreshed.credentials as AliExpressDropshippingCredentials;
    }
  } catch (error: any) {
    logger.warn('[TMP-PUBLISH] Dropshipping token refresh skipped', {
      error: error?.message || String(error),
    });
  }

  aliexpressDropshippingAPIService.setCredentials(creds as AliExpressDropshippingCredentials);
}

type Candidate = {
  itemId: string;
  title: string;
  description: string;
  category: string | null;
  ratingFive: number;
  shippingServiceName: string;
  shippingCostUsd: number;
  shippingEtaDays: number | null;
  aliexpressCostUsd: number;
  suggestedPriceUsd: number;
  skuId: string | null;
  acceptedImages: string[];
  sourceKeyword: string;
};

async function findQualifiedCandidate(userId: number): Promise<Candidate> {
  const searchMap = new Map<string, any>();

  for (const keyword of KEYWORDS) {
    try {
      const result = await aliexpressAffiliateAPIService.searchProducts({
        keywords: keyword,
        pageNo: 1,
        pageSize: 30,
        targetCurrency: 'USD',
        targetLanguage: 'EN',
        shipToCountry: 'US',
      });
      for (const row of result.products || []) {
        const pid = String(row.productId || '').trim();
        if (!pid || searchMap.has(pid)) continue;
        searchMap.set(pid, { ...row, _sourceKeyword: keyword });
      }
    } catch (error: any) {
      logger.warn('[TMP-PUBLISH] Affiliate search failed for keyword', {
        keyword,
        error: error?.message || String(error),
      });
    }
    if (searchMap.size >= 60) break;
  }

  if (searchMap.size === 0) {
    throw new Error('No affiliate candidates found');
  }

  const allIds = Array.from(searchMap.keys()).slice(0, 150);
  const detailById = new Map<string, any>();
  for (let i = 0; i < allIds.length; i += 10) {
    const batch = allIds.slice(i, i + 10);
    try {
      const details = await aliexpressAffiliateAPIService.getProductDetails({
        productIds: batch.join(','),
        shipToCountry: 'US',
        targetCurrency: 'USD',
        targetLanguage: 'EN',
      });
      for (const detail of details || []) {
        const pid = String(detail.productId || '').trim();
        if (pid) detailById.set(pid, detail);
      }
    } catch (error: any) {
      logger.warn('[TMP-PUBLISH] getProductDetails batch failed', {
        size: batch.length,
        error: error?.message || String(error),
      });
    }
  }

  const scored = Array.from(searchMap.values())
    .map((row) => {
      const pid = String(row.productId || '').trim();
      const detail = detailById.get(pid);
      const rating = toRatingFiveStar(
        detail?.evaluateScore ?? row.evaluateScore,
        detail?.evaluateRate ?? row.evaluateRate
      ) || 0;
      const volume = Number(detail?.volume ?? row.volume ?? 0);
      return { row, detail, pid, rating, volume };
    })
    .filter((x) => x.pid && x.rating >= MIN_RATING)
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return b.volume - a.volume;
    });

  for (const entry of scored.slice(0, 120)) {
    const { row, detail, pid, rating } = entry;

    try {
      const dsInfo = await aliexpressDropshippingAPIService.getProductInfo(pid, {
        localCountry: 'US',
        localLanguage: 'en',
      });

      const skuPick = selectPurchasableSkuSoft(dsInfo);
      if (skuPick.ok === false) {
        continue;
      }

      const rawMethods = dsInfo.shippingInfo?.availableShippingMethods ?? [];
      const approvedMethods = rawMethods
        .map((method) => {
          const methodName = String(method?.methodName || '').trim();
          const costUsd = Number(method?.cost);
          const estimatedDays =
            method?.estimatedDays != null && Number.isFinite(Number(method.estimatedDays))
              ? Number(method.estimatedDays)
              : null;
          return {
            methodName,
            costUsd: Number.isFinite(costUsd) ? costUsd : NaN,
            estimatedDays,
            isPreferred: isPreferredEbayUsShippingMethod(methodName),
            hasTracking: hasValidInternationalTrackingMethod(methodName),
          };
        })
        .filter((m) => Number.isFinite(m.costUsd) && m.costUsd >= 0)
        .filter((m) => m.isPreferred && m.hasTracking)
        .sort((a, b) => a.costUsd - b.costUsd);

      const selectedMethod = approvedMethods[0] || null;
      const freightFallbackOptions: Array<{
        methodName: string;
        costUsd: number;
        estimatedDays: number | null;
      }> = [];
      if (!selectedMethod) {
        try {
          const freightQuote = await aliexpressDropshippingAPIService.calculateBuyerFreight({
            countryCode: 'US',
            productId: pid,
            productNum: 1,
            sendGoodsCountryCode: 'CN',
            skuId: skuPick.skuId || undefined,
            price: String(Math.max(0.01, Number(skuPick.unitPrice) || Number(dsInfo.salePrice) || 0.01)),
            priceCurrency: String(dsInfo.currency || 'USD').toUpperCase(),
          });
          for (const option of freightQuote.options || []) {
            const methodName = String(option.serviceName || '').trim();
            if (
              !methodName ||
              !isPreferredEbayUsShippingMethod(methodName) ||
              !hasValidInternationalTrackingMethod(methodName)
            ) {
              continue;
            }
            const costUsd = Number(option.freightAmount);
            if (!Number.isFinite(costUsd) || costUsd < 0) continue;
            freightFallbackOptions.push({
              methodName,
              costUsd,
              estimatedDays:
                option.estimatedDeliveryTime != null &&
                Number.isFinite(Number(option.estimatedDeliveryTime))
                  ? Number(option.estimatedDeliveryTime)
                  : null,
            });
          }
          freightFallbackOptions.sort((a, b) => a.costUsd - b.costUsd);
        } catch (error: any) {
          logger.warn('[TMP-PUBLISH] Buyer freight fallback failed', {
            itemId: pid,
            error: error?.message || String(error),
          });
        }
      }
      const selectedFreightFallback = freightFallbackOptions[0] || null;
      const shippingCostUsd = selectedMethod?.costUsd ?? selectedFreightFallback?.costUsd ?? minShippingCostFromApi(dsInfo, {
        enforceEbayUsApprovedServices: true,
        requireInternationalTracking: true,
      });
      if (shippingCostUsd == null || !Number.isFinite(shippingCostUsd) || shippingCostUsd < 0) {
        continue;
      }

      const images = [
        String(detail?.productMainImageUrl || row?.productMainImageUrl || '').trim(),
        ...((Array.isArray(detail?.productSmallImageUrls) ? detail.productSmallImageUrls : []) as unknown[])
          .map((v) => String(v || '').trim()),
        ...((Array.isArray(dsInfo.productImages) ? dsInfo.productImages : []) as unknown[])
          .map((v) => String(v || '').trim()),
      ].filter((u, i, arr) => Boolean(u) && arr.indexOf(u) === i);

      if (images.length === 0) {
        continue;
      }

      const compliance = await enforceEbayImageCompliance(images, {
        maxImages: 24,
        concurrency: 3,
      });
      if (compliance.acceptedUrls.length === 0) {
        continue;
      }

      const aliexpressCostUsd = Math.max(0.01, Number(skuPick.unitPrice) || Number(dsInfo.salePrice) || 0.01);
      const pricing = calculateEbayPrice({
        aliexpressCostUsd,
        shippingCostUsd,
        targetMarginMultiplier: TARGET_MARGIN,
      });

      return {
        itemId: pid,
        title: String(detail?.productTitle || dsInfo.productTitle || row?.productTitle || `AliExpress Item ${pid}`).trim(),
        description: String(detail?.description || '').trim(),
        category: String(detail?.categoryName || '').trim() || null,
        ratingFive: Number(rating.toFixed(2)),
        shippingServiceName: selectedMethod?.methodName || selectedFreightFallback?.methodName || 'AliExpress Standard Shipping',
        shippingCostUsd: Number(shippingCostUsd.toFixed(2)),
        shippingEtaDays: selectedMethod?.estimatedDays ?? selectedFreightFallback?.estimatedDays ?? null,
        aliexpressCostUsd: Number(aliexpressCostUsd.toFixed(2)),
        suggestedPriceUsd: pricing.suggestedPriceUsd,
        skuId: skuPick.skuId || null,
        acceptedImages: compliance.acceptedUrls,
        sourceKeyword: String(row?._sourceKeyword || ''),
      };
    } catch (error: any) {
      logger.warn('[TMP-PUBLISH] Candidate rejected due runtime check', {
        itemId: pid,
        error: error?.message || String(error),
      });
      continue;
    }
  }

  throw new Error('No candidate passed rating + shipping + image compliance checks');
}

async function main(): Promise<void> {
  console.log('=== TMP backend eBay publish with strict supplier/image gates ===');
  console.log(JSON.stringify({ USER_ID, TARGET_MARGIN, MIN_RATING }, null, 2));

  await configureAffiliate(USER_ID);
  await configureDropshipping(USER_ID);

  const candidate = await findQualifiedCandidate(USER_ID);
  console.log('\n[SELECTED_CANDIDATE]');
  console.log(JSON.stringify(candidate, null, 2));

  const aliexpressUrl = `https://www.aliexpress.com/item/${candidate.itemId}.html?manual_cycle=${Date.now()}`;

  const dto: CreateProductDto = {
    title: candidate.title.slice(0, 80),
    description: candidate.description || '',
    aliexpressUrl,
    aliexpressPrice: candidate.aliexpressCostUsd,
    suggestedPrice: candidate.suggestedPriceUsd,
    finalPrice: candidate.suggestedPriceUsd,
    imageUrl: candidate.acceptedImages[0],
    imageUrls: candidate.acceptedImages,
    category: candidate.category || undefined,
    currency: 'USD',
    shippingCost: candidate.shippingCostUsd,
    targetCountry: 'US',
    originCountry: 'CN',
    estimatedDeliveryDays: candidate.shippingEtaDays ?? 25,
    productData: {
      manualListEbayUs: {
        validatedAt: new Date().toISOString(),
        sourceKeyword: candidate.sourceKeyword,
        compliance: {
          supplierRatingFive: candidate.ratingFive,
          minimumRequiredRatingFive: MIN_RATING,
          selectedShippingService: candidate.shippingServiceName,
          hasValidInternationalTracking: true,
        },
      },
    },
  };

  const created = await productService.createProduct(USER_ID, dto, true);
  await productService.updateProductStatusSafely(
    created.id,
    'APPROVED',
    USER_ID,
    'tmp script: manual validated ebay publish'
  );

  const environment = await workflowConfigService.getUserEnvironment(USER_ID);
  const marketplaceService = new MarketplaceService();

  const publishResult = await marketplaceService.publishProduct(
    USER_ID,
    {
      productId: created.id,
      marketplace: 'ebay',
      customData: {
        price: candidate.suggestedPriceUsd,
        targetMarginMultiplier: TARGET_MARGIN,
        publishMode: 'international',
        publishIntent: 'production',
      },
    },
    environment
  );

  if (!publishResult.success) {
    console.log('\n[PUBLISH_RESULT]');
    console.log(JSON.stringify({ success: false, productId: created.id, publishResult }, null, 2));
    throw new Error(publishResult.error || 'publish failed');
  }

  await productService.updateProductStatusSafely(created.id, 'PUBLISHED', true, USER_ID);

  const listing = await prisma.marketplaceListing.findFirst({
    where: {
      productId: created.id,
      marketplace: 'ebay',
      listingId: publishResult.listingId || undefined,
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      listingId: true,
      listingUrl: true,
      status: true,
      publishedAt: true,
      supplierUrl: true,
    },
  });

  console.log('\n[PUBLISH_RESULT]');
  console.log(
    JSON.stringify(
      {
        success: true,
        productId: created.id,
        listingId: publishResult.listingId,
        listingUrl: publishResult.listingUrl,
        listing,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('[TMP-PUBLISH] FAILED:', error?.message || String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
