/**
 * Orders API - Post-sale dropshipping orders
 */

import api from './api';

export interface OrderSaleInfo {
  id: number;
  status: string;
  trackingNumber: string | null;
}

export interface Order {
  id: string;
  productId?: number;
  title: string;
  price: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  status: 'CREATED' | 'PAID' | 'PURCHASING' | 'PURCHASED' | 'FAILED';
  paypalOrderId?: string;
  /** Marketplace order ID (e.g. eBay 17-14370-63716) when present */
  marketplaceOrderId?: string | null;
  /** Sale record when order was fulfilled (has tracking, payout state) */
  sale?: OrderSaleInfo | null;
  aliexpressOrderId?: string;
  productUrl?: string;
  errorMessage?: string;
  fulfillRetryCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetryFulfillResponse {
  success: boolean;
  orderId: string;
  status: string;
  error?: string;
  aliexpressOrderId?: string;
}

const FULFILLMENT_REQUEST_TIMEOUT_MS = 220000; // 220s — backend fulfillment timeout is 200s so backend responds first

export async function retryOrderFulfill(orderId: string): Promise<RetryFulfillResponse> {
  const res = await api.post<RetryFulfillResponse>(`/api/orders/${orderId}/retry-fulfill`, {}, { timeout: FULFILLMENT_REQUEST_TIMEOUT_MS });
  return res.data;
}

/** Phase 44: Force fulfillment by eBay order ID (e.g. 17-14370-63716). */
export interface ForceFulfillResponse {
  success: boolean;
  orderId: string;
  ebayOrderId: string;
  status: string;
  aliexpressOrderId?: string;
  error?: string;
  message?: string;
}

export async function forceFulfillByEbayOrderId(ebayOrderId: string): Promise<ForceFulfillResponse> {
  const res = await api.post<ForceFulfillResponse>(`/api/orders/by-ebay-id/${encodeURIComponent(ebayOrderId)}/force-fulfill`, {}, { timeout: FULFILLMENT_REQUEST_TIMEOUT_MS });
  return res.data;
}

export async function getOrder(id: string): Promise<Order> {
  const res = await api.get<Order>(`/api/orders/${id}`);
  return res.data;
}

/** Set supplier (AliExpress) URL for an order so "Forzar compra" can run. Returns updated order. */
export async function setOrderSupplierUrl(orderId: string, url: string): Promise<Order> {
  const res = await api.patch<Order>(`/api/orders/${orderId}/supplier-url`, { url: url.trim() });
  return res.data;
}

/** Reset an order stuck in PURCHASING back to PAID so the user can use "Forzar compra en AliExpress" again. */
export async function resetOrderPurchasing(orderId: string): Promise<Order> {
  const res = await api.patch<Order>(`/api/orders/${orderId}/reset-purchasing`);
  return res.data;
}

export async function listOrders(): Promise<Order[]> {
  const res = await api.get<Order[]>('/api/orders');
  return res.data;
}

export interface CreatePayPalOrderParams {
  amount: number;
  currency?: string;
  productTitle: string;
  productUrl: string;
  returnUrl: string;
  cancelUrl: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string | object;
}

export interface CreatePayPalOrderResponse {
  success: boolean;
  paypalOrderId: string;
  approveUrl: string;
}

export async function createPayPalOrder(params: CreatePayPalOrderParams): Promise<CreatePayPalOrderResponse> {
  const res = await api.post<CreatePayPalOrderResponse>('/api/paypal/create-order', {
    amount: params.amount,
    currency: params.currency || 'USD',
    productTitle: params.productTitle,
    productUrl: params.productUrl,
    returnUrl: params.returnUrl,
    cancelUrl: params.cancelUrl,
  });
  return res.data;
}

export interface CapturePayPalOrderParams {
  orderId: string;
  productUrl: string;
  productTitle: string;
  price: number;
  currency?: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string | object;
  /** Product ID (backend uses it for automatic Sale creation after fulfillment) */
  productId?: number;
  /** Supplier cost in USD (for profit guard and optional Sale cost) */
  supplierPriceUsd?: number;
}

export interface CapturePayPalOrderResponse {
  success: boolean;
  orderId: string;
  status: string;
  aliexpressOrderId?: string;
}

export async function capturePayPalOrder(params: CapturePayPalOrderParams): Promise<CapturePayPalOrderResponse> {
  const res = await api.post<CapturePayPalOrderResponse>('/api/paypal/capture-order', params);
  return res.data;
}

export interface ImportEbayOrderParams {
  ebayOrderId: string;
  listingId?: string;
  itemId?: string;
  amount: number;
  buyerName?: string;
  buyerEmail?: string;
  shippingAddress?: {
    fullName?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    phoneNumber?: string;
  };
  productId?: number;
}

export interface ImportEbayOrderResponse {
  order: Order;
  created: boolean;
}

export async function importEbayOrder(params: ImportEbayOrderParams): Promise<ImportEbayOrderResponse> {
  const res = await api.post<ImportEbayOrderResponse>('/api/orders/import-ebay-order', {
    ebayOrderId: params.ebayOrderId,
    listingId: params.listingId ?? params.itemId,
    itemId: params.itemId ?? params.listingId,
    amount: params.amount,
    buyerName: params.buyerName,
    buyerEmail: params.buyerEmail,
    shippingAddress: params.shippingAddress,
    productId: params.productId,
  });
  return res.data;
}

export interface FetchEbayOrderResponse {
  order: Order;
  created: boolean;
  fulfilled: boolean;
}

/** Fetch a single eBay order by ID from eBay API and upsert; triggers fulfillment if new and mapeada. */
export async function fetchEbayOrder(ebayOrderId: string): Promise<FetchEbayOrderResponse> {
  const res = await api.post<FetchEbayOrderResponse>('/api/orders/fetch-ebay-order', { ebayOrderId: ebayOrderId.trim() });
  return res.data;
}
