#!/usr/bin/env tsx
import 'dotenv/config';

import { prisma } from '../src/config/database';
import { MarketplaceService } from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';
import fxService from '../src/services/fx.service';
import { resolveDestination } from '../src/services/destination.service';

function parseJsonSafely<T>(value: unknown): T | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function fetchMlItem(accessToken: string, listingId: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://api.mercadolibre.com/items/${listingId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        fetchOk: false,
        status: response.status,
        body: parseJsonSafely<Record<string, unknown>>(text) ?? text,
      };
    }

    return parseJsonSafely<Record<string, unknown>>(text) ?? { raw: text };
  } catch (error) {
    return {
      fetchOk: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const userId = Number(process.argv[2] || 1);
  const productId = Number(process.argv[3] || 32690);
  const publishTimeoutMs = 120_000;

  const gateBefore = process.env.ENABLE_ML_PUBLISH ?? null;
  const webhookConfigured = !!process.env.WEBHOOK_SECRET_MERCADOLIBRE?.trim();
  process.env.ENABLE_ML_PUBLISH = 'true';

  console.error(`[P30] start userId=${userId} productId=${productId}`);
  const marketplaceService = new MarketplaceService();
  const credentials = await marketplaceService.getCredentials(userId, 'mercadolibre', 'production');

  if (!credentials?.isActive) {
    throw new Error('mercadolibre_credentials_inactive_or_missing');
  }

  const mlCredentials = credentials.credentials as Record<string, any>;
  const siteId = String(mlCredentials.siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC').trim() || 'MLC';
  const mlService = new MercadoLibreService({
    ...mlCredentials,
    siteId,
  });
  const destination = resolveDestination('mercadolibre', { ...mlCredentials, siteId });
  const listingCurrency = mlService.getSiteCurrency(siteId);
  const listingLanguage = destination.language || 'es';
  console.error(`[P30] credentials_ok siteId=${siteId} currency=${listingCurrency} language=${listingLanguage}`);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      targetCountry: true,
      shippingCost: true,
      importTax: true,
      totalCost: true,
      finalPrice: true,
      suggestedPrice: true,
      currency: true,
      aliexpressSku: true,
      isPublished: true,
    },
  });

  if (!product || product.userId !== userId) {
    throw new Error(`product_${productId}_not_found_for_user_${userId}`);
  }

  const basePrice = Number(product.finalPrice ?? product.suggestedPrice ?? 0);
  const baseCurrency = String(product.currency || 'USD').toUpperCase();
  const finalPriceSentToMarketplace =
    listingCurrency === baseCurrency
      ? basePrice
      : fxService.convert(basePrice, baseCurrency, listingCurrency);
  const fallbackDescription =
    `Producto: ${String(product.title || '').trim()}. Publicado con control de calidad.`;
  const predictedCategoryId = await mlService.predictCategory(
    String(product.title || '').trim(),
    fallbackDescription,
    siteId,
  );
  console.error(`[P30] category_predicted categoryId=${predictedCategoryId}`);

  const gateClassification =
    siteId === 'MLC' && listingCurrency === 'CLP'
      ? webhookConfigured
        ? 'automation_ready'
        : 'manual_or_polling_partial'
      : 'publish_blocked';

  if (siteId !== 'MLC') {
    throw new Error(`site_not_mlc:${siteId}`);
  }
  if (listingCurrency !== 'CLP') {
    throw new Error(`currency_not_clp_for_mlc:${listingCurrency}`);
  }
  if (String(product.targetCountry || '').toUpperCase() !== 'CL') {
    throw new Error(`target_country_not_cl:${product.targetCountry}`);
  }
  if (listingLanguage !== 'es') {
    throw new Error(`language_not_spanish:${listingLanguage}`);
  }

  console.error('[P30] publish_call_start');
  const publishResult = await Promise.race([
    marketplaceService.publishProduct(
      userId,
      {
        productId,
        marketplace: 'mercadolibre',
        customData: {
          title: String(product.title || '').trim(),
          description: fallbackDescription,
          categoryId: predictedCategoryId,
          price: basePrice,
          quantity: 1,
        },
      },
      'production',
    ),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`publish_timeout_after_${publishTimeoutMs}ms`)), publishTimeoutMs);
    }),
  ]);
  console.error('[P30] publish_call_done');
  console.error(`[P30] publish_result=${JSON.stringify(publishResult)}`);

  if (!publishResult.success) {
    console.log(
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          userId,
          productId,
          runtimeGates: {
            enableMlPublishBefore: gateBefore,
            enableMlPublishDuringExecution: process.env.ENABLE_ML_PUBLISH,
            webhookSecretMercadoLibreConfigured: webhookConfigured,
            executionMode: gateClassification,
          },
          candidate: product,
          publishIntent: {
            siteId,
            targetCountry: product.targetCountry,
            listingCurrency,
            listingLanguage,
            categoryIdSentToMarketplace: predictedCategoryId,
            finalPriceSentToMarketplace,
            basePrice,
            baseCurrency,
          },
          publishResult,
          latestListing: null,
          marketplaceItem: null,
          marketplaceResponseCurrency: null,
        },
        null,
        2,
      ),
    );
    console.error('[P30] output_written_failure');
    return;
  }

  const latestListing = await prisma.marketplaceListing.findFirst({
    where: {
      userId,
      productId,
      marketplace: 'mercadolibre',
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      listingId: true,
      listingUrl: true,
      status: true,
      publishedAt: true,
      lastReconciledAt: true,
    },
  });

  const listingId =
    publishResult.listingId ||
    latestListing?.listingId ||
    null;
  const item = listingId && typeof mlCredentials.accessToken === 'string'
    ? await fetchMlItem(mlCredentials.accessToken, listingId)
    : null;

  const output = {
    executedAt: new Date().toISOString(),
    userId,
    productId,
    runtimeGates: {
      enableMlPublishBefore: gateBefore,
      enableMlPublishDuringExecution: process.env.ENABLE_ML_PUBLISH,
      webhookSecretMercadoLibreConfigured: webhookConfigured,
      executionMode: gateClassification,
    },
    candidate: product,
    publishIntent: {
      siteId,
      targetCountry: product.targetCountry,
      listingCurrency,
      listingLanguage,
      categoryIdSentToMarketplace: predictedCategoryId,
      finalPriceSentToMarketplace,
      basePrice,
      baseCurrency,
    },
    publishResult,
    latestListing,
    marketplaceItem: item,
    marketplaceResponseCurrency:
      (item && typeof item === 'object' && 'currency_id' in item ? item.currency_id : null) ??
      null,
  };

  console.log(JSON.stringify(output, null, 2));
  console.error('[P30] output_written');
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
