import { prisma } from '../../../config/database';
import type { TopDawgProduct, TopDawgOrderRequest, TopDawgOrderStatus } from '../topdawg-shopify-usa.types';

// TODO: Verify base URL against TopDawg API documentation
const TD_BASE = 'https://www.topdawg.com/api/v1';

export class TopDawgApiClient {
  constructor(private readonly apiKey: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${TD_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        // TODO: Verify auth header format with TopDawg
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`TopDawg API ${method} ${path} → ${res.status}: ${err.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }

  // TODO: Verify exact query params with TopDawg API docs
  async searchProducts(keyword: string, page = 1, limit = 20) {
    return this.request<{ products: TopDawgProduct[]; total: number; page: number }>(
      'GET',
      `/products?keyword=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`,
    );
  }

  async getProduct(sku: string): Promise<TopDawgProduct> {
    return this.request<TopDawgProduct>('GET', `/products/${encodeURIComponent(sku)}`);
  }

  async getInventory(sku: string): Promise<{ sku: string; qty: number }> {
    return this.request('GET', `/inventory/${encodeURIComponent(sku)}`);
  }

  // TODO: Verify order placement payload format with TopDawg API docs
  async placeOrder(order: TopDawgOrderRequest): Promise<{ orderId: string; status: string }> {
    return this.request('POST', '/orders', order);
  }

  async getOrderStatus(tdOrderId: string): Promise<TopDawgOrderStatus> {
    return this.request('GET', `/orders/${encodeURIComponent(tdOrderId)}`);
  }

  async testConnection(): Promise<boolean> {
    try {
      // TODO: Replace with a lightweight TopDawg ping/auth endpoint
      await this.request('GET', '/products?limit=1');
      return true;
    } catch {
      return false;
    }
  }
}

export async function getTopDawgClient(userId: number): Promise<TopDawgApiClient> {
  const settings = await prisma.topDawgShopifyUsaAccountSettings.findUnique({ where: { userId } });
  const apiKey = settings?.topDawgApiKey;
  if (!apiKey) throw new Error('TopDawg API key not configured. Add it in TopDawg → Shopify Settings.');
  return new TopDawgApiClient(apiKey);
}
