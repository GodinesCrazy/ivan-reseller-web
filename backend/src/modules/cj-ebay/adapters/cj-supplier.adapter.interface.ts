/**
 * CJ Supplier Adapter — contract only (FASE 3A).
 * Real HTTP client + mapping to official CJ Open API: FASE 3B.
 *
 * Do not import AliExpress, orderFulfillmentService, or legacy eBay publish flows here.
 */

import { type CjSupplierError } from './cj-supplier.errors';
import type { CjShippingQuoteNormalized } from './cj-freight-calculate.official';

/** Product summary from CJ catalog search (`product/listV2`). */
export interface CjProductSummary {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  /** From `product/listV2` `sellPrice` / `nowPrice` when parseable (USD-ish per CJ listing). */
  listPriceUsd?: number;
  /**
   * Total inventory across all variants as reported by CJ listV2
   * (`inventoryNum` / `inventory` / similar fields).
   * - `undefined` = field not present in CJ response (stock unknown — show product)
   * - `0`         = CJ reported no available stock
   * - `> 0`       = CJ reported this many units available
   */
  inventoryTotal?: number;
  /**
   * Fulfillment origin determined by warehouse-aware probing (CJ_EBAY_WAREHOUSE_AWARE=true).
   * - `US`      — `freightCalculate(startCountryCode=US)` returned a valid quote → US warehouse confirmed
   * - `CN`      — US probe failed or not attempted; ships from China
   * - `UNKNOWN` — no probe performed (feature flag off or result not yet enriched)
   * Only populated for items that received a warehouse probe in the search handler.
   */
  fulfillmentOrigin?: 'US' | 'CN' | 'UNKNOWN';
}

export interface CjSearchQuery {
  keyword?: string;
  page?: number;
  pageSize?: number;
  /**
   * Extra query params for `GET product/listV2` (only string/number/boolean values).
   * `keyword` maps to `keyWord`; page/size use `page` / `pageSize` on the query object.
   */
  productQueryBody?: Record<string, unknown>;
}

export interface CjVariantDetail {
  cjSku: string;
  /** CJ `vid` (variant id) — obligatorio para `freightCalculate` oficial. */
  cjVid?: string;
  attributes: Record<string, string>;
  unitCostUsd: number;
  stock: number;
}

export interface CjProductDetail {
  cjProductId: string;
  title: string;
  description?: string;
  imageUrls: string[];
  variants: CjVariantDetail[];
}

export interface CjShippingQuoteInput {
  /** CJ variant id (`vid` en la doc). Alternativa: `productId` si hay una sola variante. */
  variantId?: string;
  /** CJ product id (`pid`) — solo para resolver `vid` cuando existe exactamente una variante. */
  productId?: string;
  quantity: number;
  destCountry: 'US';
  destPostalCode?: string;
  /** Origen; default `CN` según CURL oficial de CJ. */
  startCountryCode?: string;
}

export type { CjShippingQuoteNormalized };

/** Entrada explícita para `quoteShippingToUsReal` (FASE 3B.1). */
export interface CjQuoteShippingToUsRealInput {
  variantId?: string;
  productId?: string;
  quantity: number;
  destPostalCode?: string;
  startCountryCode?: string;
}

export interface CjShippingQuoteResult {
  amountUsd: number;
  currency: string;
  serviceName?: string;
  carrier?: string;
  estimatedMinDays?: number;
  estimatedMaxDays?: number;
  /** When CJ does not return transit bounds */
  confidence: 'known' | 'unknown';
}

/**
 * Línea oficial `products[]` en Create Order V2 (vid/sku/cantidad/storeLineItemId).
 * Doc: https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_1-1-create-order-v2post
 */
export interface CjCreateOrderLineInput {
  /** CJ `vid` (variant id) — obligatorio para nuestra vertical. */
  cjVid: string;
  cjSku?: string;
  quantity: number;
  storeLineItemId?: string;
}

export interface CjCreateOrderInput {
  /** Se envía como `orderNumber` (único por partner, máx. 50 en doc). */
  idempotencyKey: string;
  lines: CjCreateOrderLineInput[];
  shipTo: Record<string, string>;
  /** Nombre de logística según doc (referencia Freight Calculation). */
  logisticName: string;
  fromCountryCode?: string;
  /** Doc: 1=página, 2=balance, 3=solo crear sin pago (default conservador). */
  payType?: number;
  shopLogisticsType?: number;
}

export interface CjCreateOrderResult {
  cjOrderId: string;
  status: string;
  /** Sin PII; para eventos locales. */
  rawSummary?: Record<string, unknown>;
}

/** Respuesta de `GET shopping/order/getOrderDetail` (campos usados del objeto `data`). */
export interface CjOrderStatusResult {
  status: string;
  cjOrderId?: string;
  trackNumber?: string | null;
  trackingUrl?: string | null;
  logisticName?: string | null;
  raw?: Record<string, unknown>;
}

/** Derivado de getOrderDetail: `trackNumber`, `logisticName`, `trackingUrl`. */
export interface CjTrackingResult {
  carrierCode?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  /** Estado de pedido CJ al momento de la consulta. */
  cjOrderStatus?: string;
  events?: Array<{ at: string; description: string }>;
}

/** Respuesta `data` de `confirmOrder` (doc: string con order id). */
export interface CjConfirmOrderResult {
  orderId: string;
}

/** `payBalance` exitoso (doc: `data` puede ser null). */
export interface CjPayBalanceResult {
  ok: true;
}

/**
 * Port implemented by cj-supplier.adapter.ts in FASE 3B.
 */
export interface ICjSupplierAdapter {
  readonly supplierId: 'cjdropshipping';

  verifyAuth(): Promise<{ ok: true } | { ok: false; error: CjSupplierError }>;

  searchProducts(query: CjSearchQuery): Promise<CjProductSummary[]>;

  getProductById(cjProductId: string): Promise<CjProductDetail>;

  getStockForSkus(skus: string[]): Promise<Map<string, number>>;

  quoteShippingToUs(input: CjShippingQuoteInput): Promise<CjShippingQuoteResult>;

  /**
   * Cotización USA vía `POST logistic/freightCalculate` con payload oficial (sin cjBody manual).
   */
  quoteShippingToUsReal(
    input: CjQuoteShippingToUsRealInput
  ): Promise<{
    quote: CjShippingQuoteNormalized;
    requestPayload: Record<string, unknown>;
    responseRaw: unknown;
  }>;

  /**
   * WAREHOUSE-AWARE quoting (CJ_EBAY_WAREHOUSE_AWARE feature).
   * Attempts `startCountryCode=US` first. If CJ returns a valid quote → fulfillmentOrigin=US
   * (warehouseEvidence=freight_api_confirmed). If it fails with CJ_SHIPPING_UNAVAILABLE →
   * falls back to CN (warehouseEvidence=freight_api_fallback).
   * Any other error (auth, network) is propagated — not silenced as a warehouse miss.
   */
  quoteShippingToUsWarehouseAware(
    input: CjQuoteShippingToUsRealInput
  ): Promise<{
    quote: CjShippingQuoteNormalized;
    fulfillmentOrigin: 'US' | 'CN';
    requestPayload: Record<string, unknown>;
    responseRaw: unknown;
  }>;

  createOrder(input: CjCreateOrderInput): Promise<CjCreateOrderResult>;

  getOrderStatus(cjOrderId: string): Promise<CjOrderStatusResult>;

  getTracking(cjOrderId: string): Promise<CjTrackingResult | null>;

  /** `PATCH shopping/order/confirmOrder` (doc Shopping). */
  confirmOrder(cjOrderId: string): Promise<CjConfirmOrderResult>;

  /** `POST shopping/pay/payBalance` (doc Shopping). */
  payBalance(cjOrderId: string): Promise<CjPayBalanceResult>;
}
