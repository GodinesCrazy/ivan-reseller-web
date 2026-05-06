import { prisma } from '../src/config/database';
import { cjShopifyUsaConfigService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-config.service';
import { CJ_SHOPIFY_USA_LISTING_STATUS } from '../src/modules/cj-shopify-usa/cj-shopify-usa.constants';
import { isCjShopifyUsaPetProduct, resolveMaxSellPriceUsd } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-policy.service';

function n(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const userId = Number(process.argv.find((arg) => arg.startsWith('--user='))?.split('=')[1] || 1);
  const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
  const minMarginPct = n(settings.minMarginPct, 12);
  const minProfitUsd = n(settings.minProfitUsd, 1.5);
  const maxShippingUsd = n(settings.maxShippingUsd, 15);
  const maxSellPriceUsd = resolveMaxSellPriceUsd(settings.maxSellPriceUsd);
  const minStock = Math.max(0, n(settings.minStock, 1));

  const listings = await prisma.cjShopifyUsaListing.findMany({
    where: {
      userId,
      status: {
        in: [
          CJ_SHOPIFY_USA_LISTING_STATUS.ACTIVE,
          CJ_SHOPIFY_USA_LISTING_STATUS.DRAFT,
          CJ_SHOPIFY_USA_LISTING_STATUS.RECONCILE_PENDING,
        ],
      },
    },
    include: {
      product: true,
      variant: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const risks = listings.flatMap((listing) => {
    const draft = (listing.draftPayload || {}) as Record<string, any>;
    const pricing = (draft.pricingSnapshot || {}) as Record<string, any>;
    const shipping = (draft.shippingSnapshot || {}) as Record<string, any>;
    const title = String(draft.title || listing.product.title || '');
    const rows: Array<{ type: string; severity: 'HIGH' | 'MEDIUM'; status: string; listingId: number; title: string; detail: string }> = [];
    const marginPct = n(pricing.netMarginPct, NaN);
    const profitUsd = n(pricing.netProfitUsd, NaN);
    const sellPriceUsd = n(listing.listedPriceUsd ?? pricing.suggestedSellPriceUsd, NaN);
    const shippingUsd = n(pricing.shippingCostUsd ?? shipping.amountUsd, NaN);
    const stock = n(listing.variant?.stockLastKnown, 0);

    if (!isCjShopifyUsaPetProduct({
      title: listing.product.title,
      description: listing.product.description,
      productType: draft.productType,
      attributes: listing.variant?.attributes,
    })) {
      rows.push({ type: 'NON_PET_POLICY', severity: 'HIGH', status: listing.status, listingId: listing.id, title, detail: 'Fails current pet-store policy.' });
    }
    if (!Number.isFinite(marginPct) || marginPct < minMarginPct) {
      rows.push({ type: 'LOW_MARGIN', severity: 'HIGH', status: listing.status, listingId: listing.id, title, detail: `${Number.isFinite(marginPct) ? marginPct.toFixed(1) : 'missing'}% < ${minMarginPct.toFixed(1)}%` });
    }
    if (!Number.isFinite(profitUsd) || profitUsd < minProfitUsd) {
      rows.push({ type: 'LOW_PROFIT', severity: 'HIGH', status: listing.status, listingId: listing.id, title, detail: `${Number.isFinite(profitUsd) ? `$${profitUsd.toFixed(2)}` : 'missing'} < $${minProfitUsd.toFixed(2)}` });
    }
    if (Number.isFinite(shippingUsd) && shippingUsd > maxShippingUsd) {
      rows.push({ type: 'HIGH_SHIPPING', severity: 'MEDIUM', status: listing.status, listingId: listing.id, title, detail: `$${shippingUsd.toFixed(2)} > $${maxShippingUsd.toFixed(2)}` });
    }
    if (Number.isFinite(sellPriceUsd) && sellPriceUsd > maxSellPriceUsd) {
      rows.push({ type: 'PRICE_CAP_EXCEEDED', severity: 'HIGH', status: listing.status, listingId: listing.id, title, detail: `$${sellPriceUsd.toFixed(2)} > $${maxSellPriceUsd.toFixed(2)}` });
    }
    if (stock < minStock) {
      rows.push({ type: 'LOW_STOCK', severity: 'MEDIUM', status: listing.status, listingId: listing.id, title, detail: `${stock} < ${minStock}` });
    }
    return rows;
  });

  const grouped = risks.reduce<Record<string, number>>((acc, risk) => {
    acc[risk.type] = (acc[risk.type] || 0) + 1;
    return acc;
  }, {});
  const groupedByStatus = risks.reduce<Record<string, Record<string, number>>>((acc, risk) => {
    acc[risk.status] ||= {};
    acc[risk.status][risk.type] = (acc[risk.status][risk.type] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    settings: {
      minMarginPct,
      minProfitUsd,
      maxShippingUsd,
      maxSellPriceUsd,
      minStock,
    },
    scannedListings: listings.length,
    highRiskCount: risks.filter((risk) => risk.severity === 'HIGH').length,
    mediumRiskCount: risks.filter((risk) => risk.severity === 'MEDIUM').length,
    grouped,
    groupedByStatus,
    samples: risks.slice(0, 50),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
