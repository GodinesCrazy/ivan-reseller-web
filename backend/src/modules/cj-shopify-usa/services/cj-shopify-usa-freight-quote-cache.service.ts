import { redis } from '../../../config/redis';
import type {
  CjQuoteShippingToUsRealInput,
  ICjSupplierAdapter,
} from '../../cj-ebay/adapters/cj-supplier.adapter.interface';

type WarehouseAwareQuote = Awaited<ReturnType<ICjSupplierAdapter['quoteShippingToUsWarehouseAware']>>;

const DEFAULT_TTL_MS = 86_400_000; // 24h

export function resolveFreightQuoteCacheTtlMs(): number {
  const raw = Number(process.env.CJ_SHOPIFY_USA_FREIGHT_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw >= 3_600_000 && raw <= 172_800_000) return Math.floor(raw);
  return DEFAULT_TTL_MS;
}

export function buildFreightQuoteCacheKey(userId: number, input: CjQuoteShippingToUsRealInput): string {
  const vid = String(input.variantId || '').trim();
  const pid = String(input.productId || '').trim();
  const qty = String(Math.max(1, Math.floor(Number(input.quantity ?? 1))));
  const dest = String(input.destCountryCode || 'US').trim().toUpperCase();
  return `cj:freight:USA:${userId}:${pid}:${vid}:${qty}:${dest}`;
}

/** In-process fallback when Redis is absent (not shared across instances). */
const memoryStore = new Map<string, { expiresAt: number; json: string }>();
const MEMORY_CAP = 800;

function memoryGet(key: string): string | null {
  const row = memoryStore.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return row.json;
}

function memorySet(key: string, json: string, ttlMs: number): void {
  while (memoryStore.size >= MEMORY_CAP) {
    const first = memoryStore.keys().next().value;
    if (first) memoryStore.delete(first);
    else break;
  }
  memoryStore.set(key, { expiresAt: Date.now() + ttlMs, json });
}

/**
 * Wraps CJ warehouse-aware USA freight with Redis + in-memory cache (short TTL).
 */
export async function quoteShippingToUsWarehouseAwareCached(
  userId: number,
  adapter: ICjSupplierAdapter,
  input: CjQuoteShippingToUsRealInput,
): Promise<WarehouseAwareQuote> {
  const key = buildFreightQuoteCacheKey(userId, input);
  const ttlMs = resolveFreightQuoteCacheTtlMs();

  const memHit = memoryGet(key);
  if (memHit) {
    return JSON.parse(memHit) as WarehouseAwareQuote;
  }

  try {
    const raw = await redis.get(key);
    if (raw) {
      memorySet(key, raw, ttlMs);
      return JSON.parse(raw) as WarehouseAwareQuote;
    }
  } catch {
    // ignore redis read errors
  }

  const fresh = await adapter.quoteShippingToUsWarehouseAware(input);
  const serialized = JSON.stringify(fresh);
  memorySet(key, serialized, ttlMs);
  try {
    await redis.set(key, serialized, 'PX', ttlMs);
  } catch {
    // ignore redis write errors
  }

  return fresh;
}
