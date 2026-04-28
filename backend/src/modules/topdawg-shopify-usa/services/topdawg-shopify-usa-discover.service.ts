import { prisma } from '../../../config/database';
import { getTopDawgClient } from './topdawg-api-client.service';
import { topDawgShopifyUsaConfigService } from './topdawg-shopify-usa-config.service';
import { topDawgShopifyUsaQualificationService } from './topdawg-shopify-usa-qualification.service';
import type { TopDawgProduct } from '../topdawg-shopify-usa.types';

export class TopDawgShopifyUsaDiscoverService {
  async search(userId: number, keyword: string, page = 1, pageSize = 20) {
    const client = await getTopDawgClient(userId);
    const res = await client.searchProducts(keyword, page, pageSize);
    return { results: res.products, total: res.total, page: res.page, pageSize };
  }

  async evaluate(userId: number, tdSku: string, tdVariantSku?: string) {
    const settings = await topDawgShopifyUsaConfigService.getOrCreateSettings(userId);
    const client   = await getTopDawgClient(userId);

    const product = await client.getProduct(tdSku);
    const variant = tdVariantSku
      ? product.variants.find(v => v.sku === tdVariantSku) ?? product.variants[0]
      : product.variants[0];

    if (!variant) throw new Error(`No variants found for SKU ${tdSku}`);

    const shippingEst = Number(settings.defaultShippingUsd ?? 6.99);

    const qualification = topDawgShopifyUsaQualificationService.evaluate({
      wholesaleCostUsd:    variant.wholesaleCost,
      shippingEstimateUsd: shippingEst,
      msrpUsd:             variant.msrp || undefined,
      minMarginPct:        Number(settings.minMarginPct ?? 18),
      minProfitUsd:        Number(settings.minProfitUsd ?? 2),
      maxShippingUsd:      Number(settings.maxShippingUsd ?? 12),
      minCostUsd:          Number(settings.minCostUsd ?? 5),
    });

    return { product, variant, qualification };
  }

  async importAndDraft(userId: number, tdSku: string, tdVariantSku?: string) {
    const { product, variant, qualification } = await this.evaluate(userId, tdSku, tdVariantSku);

    // Upsert product
    const dbProduct = await prisma.topDawgShopifyUsaProduct.upsert({
      where:  { userId_tdSku: { userId, tdSku: product.sku } },
      create: {
        userId,
        tdSku:       product.sku,
        title:       product.title,
        description: product.description,
        brand:       product.brand,
        category:    product.category,
        upc:         product.upc,
        images:      product.images,
        rawPayload:  product as unknown as Record<string, unknown>,
      },
      update: {
        title:       product.title,
        description: product.description,
        images:      product.images,
        rawPayload:  product as unknown as Record<string, unknown>,
      },
    });

    // Upsert variant
    const dbVariant = await prisma.topDawgShopifyUsaProductVariant.upsert({
      where:  { productId_tdVariantSku: { productId: dbProduct.id, tdVariantSku: variant.sku } },
      create: {
        productId:    dbProduct.id,
        tdVariantSku: variant.sku,
        title:        variant.title,
        wholesaleCost: variant.wholesaleCost,
        msrp:          variant.msrp,
        stockQty:      variant.stockQty,
        attributes:    variant.attributes,
      },
      update: {
        wholesaleCost: variant.wholesaleCost,
        msrp:          variant.msrp,
        stockQty:      variant.stockQty,
      },
    });

    // Save evaluation
    await prisma.topDawgShopifyUsaProductEvaluation.create({
      data: {
        userId,
        productId: dbProduct.id,
        variantId: dbVariant.id,
        status:    qualification.approved ? 'APPROVED' : 'REJECTED',
        result:    qualification as unknown as Record<string, unknown>,
      },
    });

    if (!qualification.approved) {
      return { imported: false, reason: qualification.reason, product: dbProduct, variant: dbVariant };
    }

    // Create DRAFT listing
    const existing = await prisma.topDawgShopifyUsaListing.findFirst({
      where: { userId, variantId: dbVariant.id, status: { in: ['DRAFT', 'ACTIVE', 'PUBLISHING'] } },
    });

    if (existing) {
      return { imported: true, alreadyExists: true, listing: existing, product: dbProduct, variant: dbVariant };
    }

    const listing = await prisma.topDawgShopifyUsaListing.create({
      data: {
        userId,
        productId:     dbProduct.id,
        variantId:     dbVariant.id,
        status:        'DRAFT',
        listedPriceUsd: qualification.pricing.suggestedPriceUsd,
        quantity:       variant.stockQty ?? 50,
        draftPayload: {
          tdSku:            product.sku,
          tdVariantSku:     variant.sku,
          title:            product.title,
          images:           product.images,
          vendor:           product.brand || 'PawVault',
          productType:      product.category || 'Pet Supplies',
          pricingSnapshot:  qualification.pricing,
          shippingTag:      'fast-shipping-usa',
        },
      },
    });

    return { imported: true, listing, product: dbProduct, variant: dbVariant, qualification };
  }
}

export const topDawgShopifyUsaDiscoverService = new TopDawgShopifyUsaDiscoverService();
