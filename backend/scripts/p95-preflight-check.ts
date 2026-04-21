/**
 * P95 — Isolated preventive preparation + preflight for product 32714.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

import { prisma } from '../src/config/database';
import {
  prepareProductForSafePublishing,
  persistPreventivePublishPreparation,
  runPreventiveEconomicsCore,
} from '../src/services/pre-publish-validator.service';
import { MarketplaceService } from '../src/services/marketplace.service';
import { buildMercadoLibrePublishPreflight } from '../src/services/mercadolibre-publish-preflight.service';

const PRODUCT_ID = 32714;
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'p95-preflight.json');

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
  } catch { return {}; }
}

async function main() {
  const out: Record<string, unknown> = {
    productId: PRODUCT_ID,
    at: new Date().toISOString(),
  };

  const product = await prisma.product.findUnique({ where: { id: PRODUCT_ID } });
  if (!product) throw new Error(`Product ${PRODUCT_ID} not found`);

  const marketplaceService = new MarketplaceService();
  const mlCreds = await marketplaceService.getCredentials(product.userId, 'mercadolibre', 'production');
  const listingSalePrice = marketplaceService.getEffectiveListingPrice(product as any, undefined);

  out.listingSalePriceUsd = listingSalePrice;
  out.productStatus = product.status;

  // Run economics core only (no images) to see exact economics failure
  const econCore = await runPreventiveEconomicsCore({
    userId: product.userId,
    product: {
      id: product.id,
      title: product.title,
      category: product.category,
      images: product.images,
      productData: product.productData,
      aliexpressUrl: product.aliexpressUrl || '',
      aliexpressSku: product.aliexpressSku,
      aliexpressPrice: product.aliexpressPrice,
      importTax: product.importTax,
      currency: product.currency,
      targetCountry: product.targetCountry,
      originCountry: product.originCountry,
      shippingCost: product.shippingCost,
    },
    marketplace: 'mercadolibre',
    credentials: mlCreds?.credentials as Record<string, unknown> | undefined,
    listingSalePrice,
  });

  if (econCore.ok) {
    out.economicsCore = {
      ok: true,
      shipCountry: econCore.shipCountry,
      profitability: econCore.profitability,
      feeLedger: {
        blockedByFinancialIncompleteness: econCore.feeLedger.blockedByFinancialIncompleteness,
        blockingReasons: econCore.feeLedger.blockingReasons,
      },
      selectedSupplier: {
        productId: econCore.selectedSupplier.productId,
        salePriceUsd: econCore.selectedSupplier.salePriceUsd,
        shippingUsd: econCore.selectedSupplier.shippingUsd,
        skuId: econCore.selectedSupplier.skuId,
        stock: econCore.selectedSupplier.stock,
      },
    };
  } else {
    out.economicsCore = {
      ok: false,
      message: econCore.message,
    };
  }

  // Try full preparation
  try {
    const prep = await prepareProductForSafePublishing({
      userId: product.userId,
      product: {
        id: product.id,
        title: product.title,
        category: product.category,
        images: product.images,
        productData: product.productData,
        aliexpressUrl: product.aliexpressUrl || '',
        aliexpressSku: product.aliexpressSku,
        aliexpressPrice: product.aliexpressPrice,
        importTax: product.importTax,
        currency: product.currency,
        targetCountry: product.targetCountry,
        originCountry: product.originCountry,
        shippingCost: product.shippingCost,
      },
      marketplace: 'mercadolibre',
      credentials: mlCreds?.credentials as Record<string, unknown> | undefined,
      listingSalePrice,
    });
    await persistPreventivePublishPreparation({ productId: product.id, preparation: prep });
    out.preventivePreparation = {
      ok: true,
      classification: prep.classification,
      netProfit: prep.netProfit,
      totalCost: prep.totalCost,
      shipCountry: prep.shipCountry,
    };
  } catch (e) {
    out.preventivePreparation = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Preflight
  try {
    const preflight = await buildMercadoLibrePublishPreflight({
      userId: product.userId,
      productId: PRODUCT_ID,
      isAdmin: true,
    });
    out.preflight = {
      overallState: preflight.overallState,
      publishAllowed: preflight.publishAllowed,
      blockers: preflight.blockers,
      warnings: preflight.warnings,
      nextAction: preflight.nextAction,
      listingSalePriceUsd: preflight.listingSalePriceUsd,
      productStatus: preflight.productStatus,
      images: preflight.images,
      language: preflight.language,
      credentials: preflight.credentials,
      mercadoLibreApi: preflight.mercadoLibreApi,
    };
  } catch (e) {
    out.preflight = {
      error: e instanceof Error ? e.message : String(e),
    };
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log('Preflight result written to ' + OUTPUT_FILE);
}

main()
  .catch((e) => {
    const partial: Record<string, unknown> = {};
    partial.fatalError = e instanceof Error ? e.message : String(e);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(partial, null, 2), 'utf8');
    console.error('FAILED:', partial.fatalError);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
