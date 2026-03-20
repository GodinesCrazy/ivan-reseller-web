/**
 * Phase 54 — Full risk scan for active marketplace listings (re-runs pre-publish validation).
 */

import logger from '../config/logger';
import { prisma } from '../config/database';
import MarketplaceService from './marketplace.service';
import {
  evaluatePrePublishValidation,
  type ListingRiskClass,
  type PrePublishEvaluationResult,
  type PrePublishMarketplace,
} from './pre-publish-validator.service';
import { productService } from './product.service';
import { resolveEnvironment } from '../utils/environment-resolver';
import { toNumber } from '../utils/decimal.utils';

export interface ActiveListingsRiskScanOptions {
  /** Limit scan to one reseller */
  userId?: number;
  /** If true, no unpublish / no DB flags */
  dryRun?: boolean;
  /** Default true — end listing on marketplace when UNSHIPPABLE */
  autoUnpublishUnshippable?: boolean;
  /** Default false — only flag unless set */
  autoUnpublishUnprofitable?: boolean;
  /** Create UnprofitableListingFlag for UNPROFITABLE / RISKY / CONFIG */
  writeFlags?: boolean;
}

export interface RiskScanReportEntry {
  listingDbId: number;
  productId: number;
  userId: number;
  marketplace: string;
  externalListingId: string;
  classification: ListingRiskClass;
  message: string;
  passesValidation: boolean;
  usedShippingFallback?: boolean;
  netProfit?: number;
  totalCost?: number;
  listingSalePrice?: number;
  actionsTaken: string[];
}

export interface RiskScanResult {
  scanned: number;
  summary: Record<ListingRiskClass, number>;
  /** Subset: not SAFE */
  dangerous: RiskScanReportEntry[];
  entries: RiskScanReportEntry[];
  dryRun: boolean;
}

function isPrePublishMarketplace(s: string): s is PrePublishMarketplace {
  return s === 'ebay' || s === 'mercadolibre' || s === 'amazon';
}

/**
 * Unpublish a single MarketplaceListing row (same behavior as POST /api/products/:id/unpublish for one row).
 */
export async function unpublishSingleMarketplaceListing(
  listing: {
    id: number;
    productId: number;
    userId: number;
    marketplace: string;
    listingId: string;
    sku: string | null;
  },
  productId: number
): Promise<{ success: boolean; error?: string }> {
  const mp = listing.marketplace?.toLowerCase();
  if (!isPrePublishMarketplace(mp)) {
    return { success: false, error: `Unsupported marketplace: ${mp}` };
  }

  const marketplaceService = new MarketplaceService();
  const envResolved = await resolveEnvironment({ userId: listing.userId, default: 'production' });
  const creds = await marketplaceService.getCredentials(listing.userId, mp, envResolved);
  const c = creds?.credentials as Record<string, unknown> | undefined;
  if (!creds || !c || creds.issues?.length) {
    return { success: false, error: 'Sin credenciales' };
  }

  try {
    if (mp === 'ebay') {
      const { EbayService } = await import('./ebay.service');
      const ebay = new EbayService({ ...(c as object), sandbox: envResolved === 'sandbox' } as import('./ebay.service').EbayCredentials);
      const ebayIdentifier = listing.sku || `IVAN-${productId}`;
      await ebay.endListing(ebayIdentifier, 'NotAvailable');
    } else if (mp === 'mercadolibre') {
      const { MercadoLibreService } = await import('./mercadolibre.service');
      const ml = new MercadoLibreService(c as unknown as import('./mercadolibre.service').MercadoLibreCredentials);
      await ml.closeListing(listing.listingId);
    } else if (mp === 'amazon') {
      const { AmazonService } = await import('./amazon.service');
      const amazon = new AmazonService();
      await amazon.setCredentials(c as unknown as import('./amazon.service').AmazonCredentials);
      const sku = listing.sku || listing.listingId;
      if (sku) await amazon.deleteListing(sku);
    }
    await prisma.marketplaceListing.delete({ where: { id: listing.id } });
    const remaining = await prisma.marketplaceListing.count({ where: { productId } });
    if (remaining === 0) {
      await productService.updateProductStatusSafely(productId, 'APPROVED', false, listing.userId);
    }
    return { success: true };
  } catch (e: any) {
    logger.warn('[PHASE54] unpublishSingleMarketplaceListing failed', {
      listingId: listing.id,
      error: e?.message,
    });
    return { success: false, error: e?.message };
  }
}

async function writeRiskFlag(
  productId: number,
  marketplace: string,
  classification: ListingRiskClass,
  message: string,
  netProfit?: number,
  listingSalePrice?: number
): Promise<void> {
  const marginPct =
    listingSalePrice && listingSalePrice > 0 && netProfit !== undefined
      ? (netProfit / listingSalePrice) * 100
      : 0;
  await prisma.unprofitableListingFlag.create({
    data: {
      productId,
      marketplace,
      expectedMargin: toNumber(marginPct),
      reason: `PHASE54:${classification}:${message.slice(0, 500)}`,
    },
  });
}

function toProductShape(p: {
  id: number;
  aliexpressUrl: string;
  aliexpressSku: string | null;
  aliexpressPrice: unknown;
  importTax: unknown;
  currency: string | null;
  targetCountry: string | null;
  shippingCost: unknown;
}) {
  return {
    id: p.id,
    aliexpressUrl: p.aliexpressUrl,
    aliexpressSku: p.aliexpressSku,
    aliexpressPrice: p.aliexpressPrice,
    importTax: p.importTax,
    currency: p.currency,
    targetCountry: p.targetCountry,
    shippingCost: p.shippingCost,
  };
}

function evaluationToEntry(
  listing: { id: number; listingId: string; marketplace: string; userId: number },
  productId: number,
  ev: PrePublishEvaluationResult,
  actionsTaken: string[]
): RiskScanReportEntry {
  return {
    listingDbId: listing.id,
    productId,
    userId: listing.userId,
    marketplace: listing.marketplace,
    externalListingId: listing.listingId,
    classification: ev.classification,
    message: ev.message,
    passesValidation: ev.passesValidation,
    usedShippingFallback: ev.usedShippingFallback,
    netProfit: ev.netProfit,
    totalCost: ev.totalCost,
    listingSalePrice: ev.listingSalePrice,
    actionsTaken,
  };
}

export async function runActiveListingsRiskScan(
  options: ActiveListingsRiskScanOptions = {}
): Promise<RiskScanResult> {
  const dryRun = options.dryRun === true;
  const autoUnpublishUnshippable = options.autoUnpublishUnshippable !== false;
  const autoUnpublishUnprofitable = options.autoUnpublishUnprofitable === true;
  const writeFlags = options.writeFlags !== false;

  const summary: Record<ListingRiskClass, number> = {
    SAFE: 0,
    RISKY: 0,
    UNPROFITABLE: 0,
    UNSHIPPABLE: 0,
    CONFIG: 0,
  };

  const rows = await prisma.marketplaceListing.findMany({
    where: {
      status: 'active',
      ...(options.userId != null ? { userId: options.userId } : {}),
    },
    include: { product: true },
  });

  const marketplaceService = new MarketplaceService();
  const entries: RiskScanReportEntry[] = [];

  for (const row of rows) {
    const mp = row.marketplace?.toLowerCase();
    const actionsTaken: string[] = [];

    if (!isPrePublishMarketplace(mp)) {
      summary.CONFIG++;
      entries.push({
        listingDbId: row.id,
        productId: row.productId,
        userId: row.userId,
        marketplace: row.marketplace,
        externalListingId: row.listingId,
        classification: 'CONFIG',
        message: `Unsupported marketplace for validator: ${mp}`,
        passesValidation: false,
        actionsTaken,
      });
      continue;
    }

    const envResolved = await resolveEnvironment({ userId: row.userId, default: 'production' });
    const creds = await marketplaceService.getCredentials(row.userId, mp, envResolved);
    const c = creds?.credentials as Record<string, unknown> | undefined;

    const listingSalePrice = marketplaceService.getEffectiveListingPrice(row.product, undefined);

    const ev = await evaluatePrePublishValidation({
      userId: row.userId,
      product: toProductShape(row.product),
      marketplace: mp,
      credentials: c,
      listingSalePrice,
      ignoreValidationDisabled: true,
    });

    summary[ev.classification]++;

    if (ev.classification === 'UNSHIPPABLE' && autoUnpublishUnshippable && !dryRun) {
      const u = await unpublishSingleMarketplaceListing(
        {
          id: row.id,
          productId: row.productId,
          userId: row.userId,
          marketplace: row.marketplace,
          listingId: row.listingId,
          sku: row.sku,
        },
        row.productId
      );
      actionsTaken.push(u.success ? 'unpublished_unshippable' : `unpublish_failed:${u.error || 'unknown'}`);
    } else if (ev.classification === 'UNSHIPPABLE' && dryRun) {
      actionsTaken.push('would_unpublish_unshippable');
    }

    if (ev.classification === 'UNPROFITABLE' && autoUnpublishUnprofitable && !dryRun) {
      const u = await unpublishSingleMarketplaceListing(
        {
          id: row.id,
          productId: row.productId,
          userId: row.userId,
          marketplace: row.marketplace,
          listingId: row.listingId,
          sku: row.sku,
        },
        row.productId
      );
      actionsTaken.push(u.success ? 'unpublished_unprofitable' : `unpublish_failed:${u.error || 'unknown'}`);
    } else if (ev.classification === 'UNPROFITABLE' && dryRun && autoUnpublishUnprofitable) {
      actionsTaken.push('would_unpublish_unprofitable');
    }

    if (writeFlags && !dryRun && (ev.classification === 'UNPROFITABLE' || ev.classification === 'RISKY' || ev.classification === 'CONFIG')) {
      try {
        await writeRiskFlag(row.productId, mp, ev.classification, ev.message, ev.netProfit, ev.listingSalePrice);
        actionsTaken.push('flag_written');
      } catch (e: any) {
        actionsTaken.push(`flag_failed:${e?.message}`);
      }
    } else if (writeFlags && dryRun && (ev.classification === 'UNPROFITABLE' || ev.classification === 'RISKY' || ev.classification === 'CONFIG')) {
      actionsTaken.push('would_write_flag');
    }

    if (ev.classification === 'RISKY' && !dryRun && writeFlags === false) {
      actionsTaken.push('risky_no_flag_config');
    }

    entries.push(evaluationToEntry(row, row.productId, ev, actionsTaken));
  }

  const dangerous = entries.filter((e) => e.classification !== 'SAFE');

  logger.info('[PHASE54] Active listings risk scan completed', {
    scanned: rows.length,
    summary,
    dangerous: dangerous.length,
    dryRun,
  });

  return {
    scanned: rows.length,
    summary,
    dangerous,
    entries,
    dryRun,
  };
}
