/**
 * CJ → eBay USA — único punto del módulo `cj-ebay` que instancia `EbayService` (FASE 3D).
 * Solo transporte / control hacia eBay: sin pricing, sin lógica CJ, sin MarketplaceService.publishToEbay.
 */

import { AppError } from '../../../middleware/error.middleware';
import {
  EbayService,
  type EbayCredentials,
  type EbayListingResponse,
  type EbayProduct,
} from '../../../services/ebay.service';
import { CredentialsManager, clearCredentialsCache } from '../../../services/credentials-manager.service';

async function buildEbayServiceForUser(userId: number): Promise<{
  ebay: EbayService;
  environment: 'sandbox' | 'production';
  persistUserId: number;
  entryScope: 'user' | 'global';
}> {
  for (const envName of ['production', 'sandbox'] as const) {
    const entry = await CredentialsManager.getCredentialEntry(userId, 'ebay', envName);
    if (!entry?.credentials) continue;
    const c = entry.credentials;
    const appId = String(c.appId || '').trim();
    const certId = String(c.certId || '').trim();
    if (!appId || !certId) continue;

    const persistUserId = entry.scope === 'global' ? entry.ownerUserId : userId;
    const creds: EbayCredentials = {
      appId,
      devId: String(c.devId || '').trim(),
      certId,
      token: c.token,
      refreshToken: c.refreshToken,
      expiresAt: c.expiresAt,
      sandbox: envName === 'sandbox',
    };

    const ebay = new EbayService(creds, {
      onCredentialsUpdate: async (updated) => {
        const { sandbox: sand, ...rest } = updated;
        await CredentialsManager.saveCredentials(persistUserId, 'ebay', { ...rest, sandbox: sand }, envName, {
          scope: entry.scope,
        });
        clearCredentialsCache(persistUserId, 'ebay', envName);
      },
    });

    return { ebay, environment: envName, persistUserId, entryScope: entry.scope };
  }

  throw new AppError(
    'eBay OAuth credentials not found. Connect eBay in API Settings (production or sandbox).',
    400
  );
}

export const cjEbayEbayFacadeService = {
  async verifyConnection(userId: number): Promise<{ success: boolean; message: string }> {
    const { ebay } = await buildEbayServiceForUser(userId);
    return ebay.testConnection();
  },

  async suggestCategory(userId: number, productTitle: string): Promise<string> {
    const { ebay } = await buildEbayServiceForUser(userId);
    return ebay.suggestCategory(productTitle);
  },

  /**
   * Crea inventory item + offer + publish (Inventory API) en EBAY_US.
   */
  async publishInventoryFixedPrice(
    userId: number,
    sku: string,
    product: EbayProduct
  ): Promise<{ listingId: string; listingUrl: string; offerId: string | null }> {
    const { ebay } = await buildEbayServiceForUser(userId);
    const res: EbayListingResponse = await ebay.createListing(sku, product);
    if (!res.success || !res.itemId) {
      throw new AppError(res.error || 'eBay createListing returned no listingId', 400);
    }
    const summary = await ebay.getInventoryOfferBySku(sku);
    return {
      listingId: String(res.itemId),
      listingUrl: res.listingUrl || `https://www.ebay.com/itm/${res.itemId}`,
      offerId: summary.offerId,
    };
  },

  async pauseListing(userId: number, sku: string, offerId?: string | null): Promise<void> {
    const { ebay } = await buildEbayServiceForUser(userId);
    const id = offerId && String(offerId).trim() ? String(offerId).trim() : sku;
    await ebay.endListing(id);
  },

  async getOfferSnapshotBySku(
    userId: number,
    sku: string
  ): Promise<{ offerId: string | null; listingId: string | null; status: string | null }> {
    const { ebay } = await buildEbayServiceForUser(userId);
    return ebay.getInventoryOfferBySku(sku);
  },

  /**
   * Orden Sell Fulfillment API (una línea). Fallback `orderIds=` si GET por id falla (formato legacy).
   */
  async getFulfillmentOrderById(
    userId: number,
    ebayOrderId: string
  ): Promise<{
    orderId: string;
    buyerName?: string;
    buyerUsername?: string;
    buyerEmail?: string;
    shippingAddress?: Record<string, string>;
    lineItems: Array<{
      lineItemId: string;
      sku?: string;
      itemId?: string;
      title?: string;
      quantity: number;
      price?: number;
    }>;
    total?: number;
    orderDate?: string;
    fulfillmentStatus?: string;
  }> {
    const { ebay } = await buildEbayServiceForUser(userId);
    const oid = String(ebayOrderId || '').trim();
    if (!oid) {
      throw new AppError('ebayOrderId required', 400);
    }
    try {
      return await ebay.getOrderById(oid);
    } catch (first: unknown) {
      if (first instanceof AppError && first.statusCode === 404) {
        const { orders } = await ebay.getOrdersByOrderIds([oid]);
        if (orders.length > 0) return orders[0];
      }
      throw first;
    }
  },

  /** Subir tracking a eBay (Sell Fulfillment) — sin usar fulfillment-tracking-sync legacy. */
  async submitOrderShippingFulfillment(
    userId: number,
    ebayOrderId: string,
    params: {
      lineItems: { lineItemId: string; quantity: number }[];
      trackingNumber: string;
      shippingCarrierCode?: string;
      shippedDate?: string;
    }
  ): Promise<void> {
    const { ebay } = await buildEbayServiceForUser(userId);
    await ebay.createShippingFulfillment(ebayOrderId, params);
  },
};
