/**
 * Orders API - Post-sale dropshipping orders
 */

import api from './api';

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
  aliexpressOrderId?: string;
  productUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getOrder(id: string): Promise<Order> {
  const res = await api.get<Order>(`/api/orders/${id}`);
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
