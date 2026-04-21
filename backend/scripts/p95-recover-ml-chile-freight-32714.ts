import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

import { prisma } from '../src/config/database';
import {
  aliexpressDropshippingAPIService,
  refreshAliExpressDropshippingToken,
} from '../src/services/aliexpress-dropshipping-api.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { aliExpressSupplierAdapter } from '../src/services/adapters/aliexpress-supplier.adapter';
import { selectMlChileFreightOption } from '../src/utils/ml-chile-freight-selector';
import { calculateMlChileLandedCost } from '../src/utils/ml-chile-landed-cost';
import {
  prepareProductForSafePublishing,
  persistPreventivePublishPreparation,
  toUsd,
} from '../src/services/pre-publish-validator.service';
import { MarketplaceService } from '../src/services/marketplace.service';
import { buildMercadoLibrePublishPreflight } from '../src/services/mercadolibre-publish-preflight.service';
import { ProductService } from '../src/services/product.service';

const PRODUCT_ID = 32714;

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function main() {
  const out: Record<string, unknown> = {
    productId: PRODUCT_ID,
    at: new Date().toISOString(),
  };

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: {
      id: true,
      userId: true,
      status: true,
      isPublished: true,
      title: true,
      category: true,
      aliexpressUrl: true,
      aliexpressSku: true,
      aliexpressPrice: true,
      suggestedPrice: true,
      finalPrice: true,
      targetCountry: true,
      originCountry: true,
      currency: true,
      shippingCost: true,
      importTax: true,
      totalCost: true,
      images: true,
      productData: true,
      updatedAt: true,
    },
  });
  if (!product) throw new Error(`Product ${PRODUCT_ID} not found`);
  out.before = {
    status: product.status,
    shippingCost: product.shippingCost,
    importTax: product.importTax,
    totalCost: product.totalCost,
    productData: parseMeta(product.productData),
  };

  const preflightBefore = await buildMercadoLibrePublishPreflight({
    userId: product.userId,
    productId: product.id,
    isAdmin: true,
  });
  out.preflightBefore = {
    overallState: preflightBefore.overallState,
    publishAllowed: preflightBefore.publishAllowed,
    blockers: preflightBefore.blockers,
    nextAction: preflightBefore.nextAction,
  };

  await refreshAliExpressDropshippingToken(product.userId, 'production', { minTtlMs: 60_000 });
  const dsCreds = (await CredentialsManager.getCredentials(
    product.userId,
    'aliexpress-dropshipping',
    'production',
  )) as Record<string, unknown> | null;
  if (!dsCreds?.appKey || !dsCreds?.appSecret || !dsCreds?.accessToken) {
    throw new Error('AliExpress dropshipping production credentials/token missing');
  }
  aliexpressDropshippingAPIService.setCredentials(dsCreds as any);

  const aeProductId = aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl || '');
  if (!aeProductId) throw new Error('Could not parse AliExpress product id from product.aliexpressUrl');

  const freightQuotes = await aliexpressDropshippingAPIService.calculateBuyerFreight(
    {
      countryCode: 'CL',
      productId: aeProductId,
      productNum: 1,
      sendGoodsCountryCode: String(product.originCountry || 'CN').trim().toUpperCase() || 'CN',
      skuId: String(product.aliexpressSku || '').trim() || undefined,
      price: String(Number(product.aliexpressPrice || 0)),
      priceCurrency: 'USD',
    },
    { forensicProbeAllVariants: true },
  );
  const selection = selectMlChileFreightOption(freightQuotes.options);
  if (!selection.selected) {
    throw new Error(
      `No valid CL freight option found for product ${PRODUCT_ID}. options=${freightQuotes.options.length}`,
    );
  }

  const shippingUsd = toUsd(selection.selected.freightAmount, selection.selected.freightCurrency || 'USD');
  const landed = calculateMlChileLandedCost({
    productCost: Number(product.aliexpressPrice || 0),
    shippingCost: shippingUsd,
    currency: 'USD',
  });

  const currentMeta = parseMeta(product.productData);
  const checkedAt = new Date().toISOString();
  const updatedMeta = {
    ...currentMeta,
    mlChileFreight: {
      freightSummaryCode: 'freight_quote_found_for_cl',
      checkedAt,
      targetCountry: 'CL',
      sendGoodsCountryCode: String(product.originCountry || 'CN').trim().toUpperCase() || 'CN',
      freightOptionsCount: freightQuotes.options.length,
      rawOptionNodeCount: freightQuotes.rawOptionNodeCount,
      rawTopKeys: freightQuotes.rawTopKeys,
      selectedServiceName: selection.selected.serviceName,
      selectedFreightAmount: selection.selected.freightAmount,
      selectedFreightCurrency: selection.selected.freightCurrency,
      selectedEstimatedDeliveryTime: selection.selected.estimatedDeliveryTime ?? null,
      selectionReason: selection.reason,
    },
    mlChileLandedCost: {
      costCurrency: landed.costCurrency,
      importTaxMethod: landed.importTaxMethod,
      importTaxAmount: landed.importTaxAmount,
      totalCost: landed.totalCost,
      landedCostCompleteness: landed.landedCostCompleteness,
      checkedAt,
    },
  };

  await prisma.product.update({
    where: { id: PRODUCT_ID },
    data: {
      shippingCost: landed.shippingCost,
      importTax: landed.importTaxAmount,
      totalCost: landed.totalCost,
      productData: JSON.stringify(updatedMeta),
    },
  });
  out.mlChileFreightRecovery = {
    persisted: true,
    selectedServiceName: selection.selected.serviceName,
    selectedFreightAmount: selection.selected.freightAmount,
    selectedFreightCurrency: selection.selected.freightCurrency,
    shippingUsd,
    shippingCostPersisted: landed.shippingCost,
    importTaxPersisted: landed.importTaxAmount,
    totalCostPersisted: landed.totalCost,
  };

  const refreshed = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: {
      id: true,
      userId: true,
      status: true,
      isPublished: true,
      title: true,
      category: true,
      aliexpressUrl: true,
      aliexpressSku: true,
      aliexpressPrice: true,
      suggestedPrice: true,
      finalPrice: true,
      targetCountry: true,
      originCountry: true,
      currency: true,
      shippingCost: true,
      importTax: true,
      totalCost: true,
      images: true,
      productData: true,
    },
  });
  if (!refreshed) throw new Error('Product disappeared after freight persistence');

  const marketplaceService = new MarketplaceService();
  const mlCreds = await marketplaceService.getCredentials(refreshed.userId, 'mercadolibre', 'production');
  const listingSalePrice = marketplaceService.getEffectiveListingPrice(refreshed as any, undefined);
  out.listingSalePriceUsd = listingSalePrice;

  try {
    const prep = await prepareProductForSafePublishing({
      userId: refreshed.userId,
      product: refreshed as any,
      marketplace: 'mercadolibre',
      credentials: mlCreds?.credentials as Record<string, unknown> | undefined,
      listingSalePrice,
    });
    await persistPreventivePublishPreparation({ productId: refreshed.id, preparation: prep });
    out.preventivePreparation = {
      ok: true,
      netProfit: prep.netProfit,
      totalCost: prep.totalCost,
      shipCountry: prep.shipCountry,
      supplierSku: prep.aliexpressSkuId,
    };
  } catch (e) {
    out.preventivePreparation = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const productService = new ProductService();
  const statusUpdated = await productService.updateProductStatus(PRODUCT_ID, 'APPROVED' as any, refreshed.userId);
  out.statusTransition = {
    requested: 'APPROVED',
    resultingStatus: (statusUpdated as any)?.status ?? null,
    resultingIsPublished: (statusUpdated as any)?.isPublished ?? null,
  };

  const preflightAfter = await buildMercadoLibrePublishPreflight({
    userId: refreshed.userId,
    productId: PRODUCT_ID,
    isAdmin: true,
  });
  out.preflightAfter = {
    overallState: preflightAfter.overallState,
    publishAllowed: preflightAfter.publishAllowed,
    blockers: preflightAfter.blockers,
    nextAction: preflightAfter.nextAction,
  };

  const finalProduct = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: {
      status: true,
      isPublished: true,
      shippingCost: true,
      importTax: true,
      totalCost: true,
      productData: true,
      updatedAt: true,
    },
  });
  out.after = {
    ...finalProduct,
    productData: parseMeta(finalProduct?.productData),
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
