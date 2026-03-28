/**
 * After importing from Opportunities, persist Affiliate-backed SKU + shipping truth
 * so reconciliation and catalog validation see real machine context (not a hollow row).
 */

import logger from '../config/logger';
import { prisma } from '../config/database';
import { CredentialsManager } from './credentials-manager.service';
import { AliExpressAffiliateAPIService } from './aliexpress-affiliate-api.service';
import { aliExpressSupplierAdapter } from './adapters/aliexpress-supplier.adapter';
import { toNumber } from '../utils/decimal.utils';
import { extractAliExpressItemIdFromUrl } from '../utils/aliexpress-item-id';
import type {
  AliExpressAffiliateCredentials,
  AliExpressDropshippingCredentials,
} from '../types/api-credentials.types';

function parseProductData(raw: string | null | undefined): Record<string, any> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? (o as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function mergeProductDataRoot(
  existing: string | null | undefined,
  patch: {
    opportunityImport?: Record<string, any>;
    preventivePublish?: Record<string, any>;
  }
): string {
  const root = parseProductData(existing);
  if (patch.opportunityImport) {
    root.opportunityImport = { ...(root.opportunityImport || {}), ...patch.opportunityImport };
  }
  if (patch.preventivePublish) {
    root.preventivePublish = { ...(root.preventivePublish || {}), ...patch.preventivePublish };
  }
  return JSON.stringify(root);
}

function pickAffiliateSkuId(
  skus: Array<{ skuId: string; skuStock: number }>
): { skuId: string; reason: string } | null {
  const withId = skus.filter((s) => String(s.skuId || '').trim().length > 0);
  if (withId.length === 0) return null;
  const inStock = withId.find((s) => Number(s.skuStock) > 0);
  if (inStock) return { skuId: String(inStock.skuId).trim(), reason: 'first_in_stock' };
  return { skuId: String(withId[0]!.skuId).trim(), reason: 'first_available_no_positive_stock' };
}

export interface OpportunityImportEnrichmentResult {
  ok: boolean;
  reason: string;
  skuResolved?: boolean;
  shippingResolved?: boolean;
}

/**
 * Loads user's AliExpress Affiliate credentials, resolves default SKU + shipping for the item,
 * updates Product.aliexpressSku / shippingCost / totalCost / productData (root keys).
 */
export async function enrichProductAfterOpportunityImport(
  productId: number,
  userId: number
): Promise<OpportunityImportEnrichmentResult> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      userId: true,
      aliexpressUrl: true,
      targetCountry: true,
      aliexpressSku: true,
      shippingCost: true,
      importTax: true,
      totalCost: true,
      aliexpressPrice: true,
      productData: true,
    },
  });

  if (!product || product.userId !== userId) {
    return { ok: false, reason: 'product_not_found_or_forbidden' };
  }

  const meta = parseProductData(product.productData);
  const oi = meta.opportunityImport || {};
  const isOpportunity =
    oi.importSource === 'opportunity_search' || meta.importSource === 'opportunity_search';
  if (!isOpportunity) {
    return { ok: false, reason: 'not_opportunity_import' };
  }

  const aeId =
    (typeof oi.aliExpressItemId === 'string' && oi.aliExpressItemId.trim()) ||
    aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl || '') ||
    extractAliExpressItemIdFromUrl(product.aliexpressUrl || '') ||
    null;

  if (!aeId) {
    const productData = mergeProductDataRoot(product.productData, {
      opportunityImport: {
        affiliateEnrichment: 'failed',
        affiliateEnrichmentReason: 'missing_aliexpress_item_id',
        affiliateEnrichmentAt: new Date().toISOString(),
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { productData },
    });
    return { ok: false, reason: 'missing_aliexpress_item_id' };
  }

  let creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-affiliate',
    'production'
  )) as AliExpressAffiliateCredentials | null;
  if (!creds?.appKey || !creds?.appSecret) {
    creds = (await CredentialsManager.getCredentials(
      userId,
      'aliexpress-affiliate',
      'sandbox'
    )) as AliExpressAffiliateCredentials | null;
  }

  const api = new AliExpressAffiliateAPIService();
  if (creds?.appKey && creds?.appSecret) {
    api.setCredentials(creds);
  }
  const affiliateConfigured = api.isConfigured();

  const ship = String(product.targetCountry || 'CL')
    .trim()
    .slice(0, 2)
    .toUpperCase() || 'CL';

  let skuId: string | null = product.aliexpressSku?.trim() || null;
  let skuPickReason: string | null = skuId ? 'already_set' : null;
  let shippingNum: number | null =
    product.shippingCost !== null && product.shippingCost !== undefined
      ? toNumber(product.shippingCost as any)
      : null;
  let shippingSource: string | null = shippingNum !== null ? 'existing_product' : null;
  let affiliateError: string | null = null;

  if (affiliateConfigured) {
    try {
      if (!skuId) {
        const skus = await api.getSKUDetails(aeId, {
          shipToCountry: ship,
          targetLanguage: 'es',
          targetCurrency: 'USD',
        });
        const picked = pickAffiliateSkuId(skus);
        if (picked) {
          skuId = picked.skuId;
          skuPickReason = picked.reason;
        }
      }

      if (shippingNum === null) {
        const details = await api.getProductDetails({
          productIds: aeId,
          shipToCountry: ship,
          targetLanguage: 'ES',
          targetCurrency: 'USD',
        });
        const d = details[0];
        const sc = d?.shippingInfo?.shippingCost;
        if (typeof sc === 'number' && Number.isFinite(sc) && sc >= 0) {
          shippingNum = sc;
          shippingSource = 'affiliate_product_details';
        }
      }
    } catch (err: any) {
      affiliateError = err?.message || 'affiliate_api_error';
      logger.warn('[OPPORTUNITY-IMPORT-ENRICH] Affiliate enrichment failed', {
        productId,
        userId,
        aeId,
        error: affiliateError,
      });
    }
  } else {
    affiliateError = 'affiliate_api_not_configured';
  }

  // Dropshipping API fallback (many sellers have DS token but not Affiliate portal keys)
  if ((!skuId || shippingNum === null) && aeId) {
    try {
      const dsCreds = (await CredentialsManager.getCredentials(
        userId,
        'aliexpress-dropshipping',
        'production'
      )) as AliExpressDropshippingCredentials | null;
      if (dsCreds?.accessToken) {
        const { aliexpressDropshippingAPIService } = await import('./aliexpress-dropshipping-api.service');
        aliexpressDropshippingAPIService.setCredentials(dsCreds);
        const info = await aliexpressDropshippingAPIService.getProductInfo(aeId, {
          localCountry: ship,
          localLanguage: 'es',
        });
        if (!skuId && info.skus && info.skus.length > 0) {
          const pick = info.skus.find((s) => Number(s.stock) > 0) || info.skus[0];
          if (pick?.skuId) {
            skuId = String(pick.skuId).trim();
            skuPickReason = skuPickReason || 'dropshipping_getProductInfo';
          }
        }
        if (shippingNum === null && info.shippingInfo?.availableShippingMethods?.length) {
          const costs = info.shippingInfo.availableShippingMethods
            .map((m) => m.cost)
            .filter((c) => typeof c === 'number' && Number.isFinite(c) && c >= 0);
          if (costs.length > 0) {
            shippingNum = Math.min(...costs);
            shippingSource = shippingSource || 'dropshipping_shipping_methods';
          }
        }
      }
    } catch (dsErr: any) {
      logger.warn('[OPPORTUNITY-IMPORT-ENRICH] Dropshipping fallback failed', {
        productId,
        aeId,
        error: dsErr?.message || String(dsErr),
      });
    }
  }

  const base = toNumber(product.aliexpressPrice as any);
  const tax = toNumber(product.importTax as any);
  let totalNum =
    product.totalCost !== null && product.totalCost !== undefined
      ? toNumber(product.totalCost as any)
      : null;
  if (totalNum === null && shippingNum !== null) {
    totalNum = Number((base + shippingNum + tax).toFixed(2));
  }

  const enrichmentStatus =
    skuId && shippingNum !== null ? 'ok' : skuId || shippingNum !== null ? 'partial' : 'failed';

  const productData = mergeProductDataRoot(product.productData, {
    opportunityImport: {
      affiliateEnrichment: enrichmentStatus,
      affiliateEnrichmentAt: new Date().toISOString(),
      affiliateEnrichmentReason: affiliateError || undefined,
      aliExpressItemId: aeId,
      affiliateApiConfigured: affiliateConfigured,
    },
    preventivePublish: {
      selectedSupplier: {
        productId: aeId,
        skuId: skuId || null,
        source: skuPickReason?.includes('dropshipping') ? 'opportunity_import_dropshipping' : 'opportunity_import_affiliate',
      },
    },
  });

  const data: Record<string, unknown> = { productData };
  if (skuId) data.aliexpressSku = skuId;
  if (shippingNum !== null) data.shippingCost = shippingNum;
  if (totalNum !== null) data.totalCost = totalNum;

  await prisma.product.update({
    where: { id: productId },
    data: data as any,
  });

  logger.info('[OPPORTUNITY-IMPORT-ENRICH] Updated product from affiliate', {
    productId,
    userId,
    aeId,
    skuPickReason,
    shippingSource,
    hasSku: !!skuId,
    shippingKnown: shippingNum !== null,
  });

  return {
    ok: !!(skuId && shippingNum !== null),
    reason: skuId && shippingNum !== null ? 'sku_and_shipping_resolved' : 'partial_resolution',
    skuResolved: !!skuId,
    shippingResolved: shippingNum !== null,
  };
}
