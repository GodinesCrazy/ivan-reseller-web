#!/usr/bin/env tsx
import 'dotenv/config';

import { prisma } from '../src/config/database';
import MarketplaceService from '../src/services/marketplace.service';
import { MercadoLibreService, type MLItemSnapshot } from '../src/services/mercadolibre.service';
import { syncMercadoLibreOrdersForUser } from '../src/services/mercadolibre-order-sync.service';


type FurthestStage =
  | 'listing_active_no_order_yet'
  | 'order_ingested'
  | 'supplier_purchase_attempted'
  | 'supplier_purchase_proved'
  | 'tracking_attached'
  | 'delivered_truth_obtained'
  | 'released_funds_obtained'
  | 'realized_profit_obtained';

function summarizeItem(snapshot: MLItemSnapshot | null) {
  if (!snapshot) return null;
  return {
    id: snapshot.id ?? null,
    title: snapshot.title ?? null,
    status: snapshot.status ?? null,
    sub_status: Array.isArray(snapshot.sub_status) ? snapshot.sub_status : [],
    health: typeof snapshot.health === 'number' ? snapshot.health : null,
    permalink: snapshot.permalink ?? null,
    pictures: Array.isArray(snapshot.pictures)
      ? snapshot.pictures.map((picture) => ({
          id: picture.id ?? null,
          url: picture.secure_url || picture.url || null,
          max_size: picture.max_size ?? null,
        }))
      : [],
  };
}

function looksRealSupplierOrderId(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return !(
    normalized === 'manual' ||
    normalized.startsWith('test') ||
    normalized.startsWith('demo') ||
    normalized.startsWith('mock')
  );
}

function classifyStage(order: any | null, sale: any | null): FurthestStage {
  if (!order) {
    return 'listing_active_no_order_yet';
  }

  const realSupplierProof = looksRealSupplierOrderId(order.aliexpressOrderId);
  const orderStatus = String(order.status || '').toUpperCase();
  const saleStatus = String(sale?.status || '').toUpperCase();
  const trackingPresent = Boolean(String(sale?.trackingNumber || '').trim());

  if (sale?.payoutExecuted === true && typeof sale?.netProfit === 'number' && sale.netProfit > 0) {
    return 'realized_profit_obtained';
  }
  if (sale?.payoutExecuted === true) {
    return 'released_funds_obtained';
  }
  if (saleStatus === 'DELIVERED' || saleStatus === 'COMPLETED') {
    return 'delivered_truth_obtained';
  }
  if (trackingPresent) {
    return 'tracking_attached';
  }
  if (orderStatus === 'PURCHASED' && realSupplierProof) {
    return 'supplier_purchase_proved';
  }
  if (
    orderStatus === 'PURCHASING' ||
    orderStatus === 'FAILED' ||
    orderStatus === 'MANUAL_ACTION_REQUIRED' ||
    orderStatus === 'FULFILLMENT_BLOCKED' ||
    orderStatus === 'PURCHASED'
  ) {
    return 'supplier_purchase_attempted';
  }
  return 'order_ingested';
}

async function headStatus(url: string | null | undefined): Promise<number | null> {
  const target = String(url || '').trim();
  if (!target) return null;
  try {
    const response = await fetch(target, { method: 'HEAD', redirect: 'manual' });
    return response.status;
  } catch {
    return null;
  }
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** URL slugs use `MLC-123` while API ids use `MLC123`. */
function hyphenatedSiteListingId(listingId: string): string | null {
  const trimmed = listingId.trim();
  const m = /^ML([A-Z])(\d+)$/i.exec(trimmed);
  if (!m) return null;
  return `ML${m[1].toUpperCase()}-${m[2]}`;
}

const ML_PUBLIC_ERROR_HINTS = [
  'página no existe',
  'pagina no existe',
  'no existe',
  'algo salió mal',
  'algo salio mal',
  'no encontramos',
  'item not found',
];

type PublicSurfaceClassification =
  | 'likely_product_page'
  | 'likely_error_page'
  | 'ambiguous'
  | 'fetch_failed';

/**
 * Browser-like GET of the public permalink (HEAD alone often returns 403 on ML while GET works).
 */
function detectMlBotChallengeShell(html: string): boolean {
  const s = html.slice(0, 8000);
  return (
    s.includes('verifyChallenge') ||
    s.includes('_bmstate') ||
    /This page requires JavaScript to work/i.test(s)
  );
}

async function probePermalinkPublic(
  url: string | null | undefined,
  listingIdHint: string | null | undefined
): Promise<{
  getStatus: number | null;
  publicSurfaceClassification: PublicSurfaceClassification;
  matchedErrorHints: string[];
  listingIdFoundInBody: boolean;
  challengeShellDetected: boolean;
  bodyByteLengthApprox: number;
  bodySample: string;
}> {
  const target = String(url || '').trim();
  if (!target) {
    return {
      getStatus: null,
      publicSurfaceClassification: 'fetch_failed',
      matchedErrorHints: [],
      listingIdFoundInBody: false,
      challengeShellDetected: false,
      bodyByteLengthApprox: 0,
      bodySample: '',
    };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const status = response.status;
    const text = await response.text();
    const slice = text.slice(0, 200000);
    const challengeShellDetected = detectMlBotChallengeShell(slice);
    const lower = slice.toLowerCase();
    const matchedErrorHints = ML_PUBLIC_ERROR_HINTS.filter((hint) => lower.includes(hint));
    const lid = String(listingIdHint || '').trim();
    const hyphenId = hyphenatedSiteListingId(lid);
    const listingIdFoundInBody = Boolean(
      lid && (slice.includes(lid) || (hyphenId != null && slice.includes(hyphenId)))
    );
    const pdpSignals =
      /schema\.org\/product|ui-pdp-|data-testid="price"|__PRELOADED_STATE__/i.test(slice);
    const bodyByteLengthApprox = Buffer.byteLength(text, 'utf8');

    if (status < 200 || status >= 400) {
      return {
        getStatus: status,
        publicSurfaceClassification: 'likely_error_page',
        matchedErrorHints,
        listingIdFoundInBody,
        challengeShellDetected,
        bodyByteLengthApprox,
        bodySample: slice.replace(/\s+/g, ' ').slice(0, 240),
      };
    }
    if (challengeShellDetected) {
      return {
        getStatus: status,
        publicSurfaceClassification: 'ambiguous',
        matchedErrorHints,
        listingIdFoundInBody,
        challengeShellDetected: true,
        bodyByteLengthApprox,
        bodySample: slice.replace(/\s+/g, ' ').slice(0, 240),
      };
    }
    if (matchedErrorHints.length > 0) {
      return {
        getStatus: status,
        publicSurfaceClassification: 'likely_error_page',
        matchedErrorHints,
        listingIdFoundInBody,
        challengeShellDetected,
        bodyByteLengthApprox,
        bodySample: slice.replace(/\s+/g, ' ').slice(0, 240),
      };
    }
    if (pdpSignals || listingIdFoundInBody) {
      return {
        getStatus: status,
        publicSurfaceClassification: 'likely_product_page',
        matchedErrorHints,
        listingIdFoundInBody,
        challengeShellDetected,
        bodyByteLengthApprox,
        bodySample: slice.replace(/\s+/g, ' ').slice(0, 240),
      };
    }
    return {
      getStatus: status,
      publicSurfaceClassification: 'ambiguous',
      matchedErrorHints,
      listingIdFoundInBody,
      challengeShellDetected,
      bodyByteLengthApprox,
      bodySample: slice.replace(/\s+/g, ' ').slice(0, 240),
    };
  } catch {
    clearTimeout(timer);
    return {
      getStatus: null,
      publicSurfaceClassification: 'fetch_failed',
      matchedErrorHints: [],
      listingIdFoundInBody: false,
      challengeShellDetected: false,
      bodyByteLengthApprox: 0,
      bodySample: '',
    };
  }
}

async function main(): Promise<void> {
  const userId = Number(process.argv[2] || 1);
  const productId = Number(process.argv[3] || 32690);
  const listingIdArg = String(process.argv[4] || '').trim();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      isPublished: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
  if (!product) {
    throw new Error(`product_${productId}_not_found`);
  }

  const listing = await prisma.marketplaceListing.findFirst({
    where: {
      productId,
      marketplace: 'mercadolibre',
      ...(listingIdArg ? { listingId: listingIdArg } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!listing?.listingId) {
    throw new Error(`mercadolibre_listing_not_found_for_product_${productId}`);
  }

  const marketplaceService = new MarketplaceService();
  const credentials = await marketplaceService.getCredentials(userId, 'mercadolibre', 'production');
  if (!credentials?.isActive) {
    throw new Error('mercadolibre_production_credentials_not_available');
  }

  const mlService = new MercadoLibreService(credentials.credentials as any);
  const itemSnapshot = await mlService.getItem(listing.listingId);
  const permalinkUrl = itemSnapshot?.permalink || listing.listingUrl;
  const permalinkStatus = await headStatus(permalinkUrl);
  const permalinkPublicProbe = await probePermalinkPublic(permalinkUrl, listing.listingId);

  const recentOrders = await mlService.searchRecentOrders(30);
  const matchingRecentOrders = recentOrders.filter((order: any) => {
    const items = Array.isArray(order.order_items)
      ? order.order_items
      : Array.isArray(order.items)
        ? order.items
        : [];
    return items.some((item: any) => {
      const itemId = String(item?.item?.id || item?.itemId || '').trim();
      return itemId === listing.listingId;
    });
  });

  const syncResult = await syncMercadoLibreOrdersForUser(userId, 'production');

  const internalOrders = await prisma.order.findMany({
    where: {
      userId,
      productId,
      paypalOrderId: {
        startsWith: 'mercadolibre:',
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const latestOrder = internalOrders[0] ?? null;
  const latestSale = latestOrder
    ? await prisma.sale.findUnique({
        where: { orderId: latestOrder.id },
      })
    : null;

  const stage = classifyStage(latestOrder, latestSale);

  const orderSummary = matchingRecentOrders.map((order: any) => ({
    id: String(order.id || ''),
    status: order.status || null,
    totalAmount: order.total_amount ?? order.totalAmount ?? null,
    currency: order.currency_id ?? order.currencyId ?? null,
    dateCreated: order.date_created ?? order.dateCreated ?? null,
    buyer: {
      id: order.buyer?.id ?? null,
      nickname: order.buyer?.nickname ?? null,
      email: order.buyer?.email ?? null,
    },
    itemIds: (order.order_items || order.items || []).map((item: any) =>
      String(item?.item?.id || item?.itemId || '').trim()
    ),
  }));

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userId,
        product: {
          id: product.id,
          status: product.status,
          isPublished: product.isPublished,
          publishedAt: product.publishedAt,
          updatedAt: product.updatedAt,
        },
        listing: {
          listingId: listing.listingId,
          status: listing.status,
          listingUrl: listing.listingUrl,
          updatedAt: listing.updatedAt,
          productId: listing.productId,
        },
        liveItem: summarizeItem(itemSnapshot),
        permalinkHeadStatus: permalinkStatus,
        permalinkPublicProbe,
        matchingRecentOrders: {
          count: orderSummary.length,
          orders: orderSummary,
        },
        syncResult,
        internalOrders: internalOrders.map((order) => ({
          id: order.id,
          paypalOrderId: order.paypalOrderId,
          status: order.status,
          aliexpressOrderId: order.aliexpressOrderId,
          errorMessage: order.errorMessage,
          failureReason: order.failureReason,
          manualFulfillmentRequired: order.manualFulfillmentRequired,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        })),
        latestSale: latestSale
          ? {
              id: latestSale.id,
              status: latestSale.status,
              trackingNumber: latestSale.trackingNumber,
              payoutExecuted: latestSale.payoutExecuted,
              netProfit: latestSale.netProfit,
              createdAt: latestSale.createdAt,
              updatedAt: latestSale.updatedAt,
            }
          : null,
        furthestStage: stage,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
