#!/usr/bin/env tsx
/**
 * P66/P67: Merge AliExpress product images into product.images (listing-scoped).
 * Order: Dropshipping getProductInfo (OAuth); if missing or empty → Affiliate productdetail + SKU images (app_key).
 */
/** Must match other operational scripts: loads `.env.local` + validates ENCRYPTION_KEY so DB credential decrypt succeeds. */
import '../src/config/env';

import { prisma } from '../src/config/database';
import {
  AliExpressDropshippingAPIService,
  refreshAliExpressDropshippingToken,
} from '../src/services/aliexpress-dropshipping-api.service';
import { AliExpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';

/** Strip query/hash so CDN size variants dedupe as one logical image where path matches. */
function normalizeAeImageUrl(u: string): string {
  try {
    const x = new URL(u.trim());
    x.search = '';
    x.hash = '';
    return x.href;
  } catch {
    return u.trim();
  }
}

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) {
      return j.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function extractAeProductId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(\d{8,})\.html/);
  return m ? m[1]! : null;
}

async function getDsApi(userId: number): Promise<AliExpressDropshippingAPIService | null> {
  for (const environment of ['production', 'sandbox'] as const) {
    let creds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment);
    if (!creds) continue;
    const refreshed = await refreshAliExpressDropshippingToken(userId, environment, { minTtlMs: 60_000 });
    if (refreshed.credentials) creds = refreshed.credentials;
    if (!String((creds as any).accessToken || '').trim()) continue;
    const api = new AliExpressDropshippingAPIService();
    api.setCredentials(creds);
    return api;
  }
  return null;
}

/** AliExpress sometimes returns several gallery URLs in one semicolon-separated string. */
function splitImageUrlChunks(raw: string): string[] {
  const t = raw.trim();
  if (!t.startsWith('http')) return [];
  if (!t.includes(';')) return [t];
  return t.split(';').map((s) => s.trim()).filter((s) => s.startsWith('http'));
}

function mergeUnique(existing: string[], discovered: string[]): string[] {
  const seenNorm = new Set<string>();
  const out: string[] = [];
  for (const u of [...existing, ...discovered]) {
    for (const n of splitImageUrlChunks(u)) {
      if (!n.startsWith('http')) continue;
      const key = normalizeAeImageUrl(n);
      if (seenNorm.has(key)) continue;
      seenNorm.add(key);
      out.push(n);
    }
  }
  return out;
}

async function discoverViaAffiliate(
  userId: number,
  aeId: string,
  ship: string
): Promise<{ urls: string[]; outcome: string }> {
  const creds = await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production');
  const api = new AliExpressAffiliateAPIService();
  if (creds?.appKey && creds?.appSecret) {
    api.setCredentials(creds as any);
  }
  if (!api.isConfigured()) {
    return { urls: [], outcome: 'affiliate_not_configured' };
  }
  const found: string[] = [];
  try {
    const details = await api.getProductDetails({
      productIds: aeId,
      shipToCountry: ship,
      targetLanguage: 'es',
    });
    const p = details[0];
    if (p) {
      if (typeof p.productMainImageUrl === 'string' && p.productMainImageUrl.startsWith('http')) {
        found.push(p.productMainImageUrl);
      }
      for (const u of p.productSmallImageUrls || []) {
        if (typeof u === 'string' && u.startsWith('http')) found.push(u);
      }
    }
  } catch {
    /* fall through — try SKU path */
  }
  try {
    const skus = await api.getSKUDetails(aeId, { shipToCountry: ship, targetLanguage: 'es' });
    for (const s of skus) {
      const iu = s.skuImageUrl;
      if (typeof iu === 'string' && iu.startsWith('http')) found.push(iu);
    }
  } catch {
    /* ignore */
  }
  const outcome = found.length ? 'affiliate_ok' : 'affiliate_empty_or_failed';
  return { urls: found, outcome };
}

async function main() {
  const productId = Number(process.argv[2] || 32690);
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, userId: true, images: true, aliexpressUrl: true, targetCountry: true },
  });
  if (!product) throw new Error(`product_${productId}_not_found`);

  const existing = parseImages(product.images);
  const aeId = extractAeProductId(product.aliexpressUrl);
  const discovered: string[] = [];
  let enrichPath: string = 'none';

  const ship = String(product.targetCountry || 'CL').slice(0, 2).toUpperCase() || 'CL';

  const api = await getDsApi(product.userId);
  if (api && aeId) {
    enrichPath = 'dropshipping';
    try {
      const info = await api.getProductInfo(aeId, { localCountry: ship, localLanguage: 'es' });
      for (const u of info.productImages || []) {
        if (typeof u === 'string' && u.startsWith('http')) {
          for (const chunk of splitImageUrlChunks(u)) discovered.push(chunk);
        }
      }
      for (const s of info.skus || []) {
        const iu = s.imageUrl;
        if (typeof iu === 'string' && iu.startsWith('http')) {
          for (const chunk of splitImageUrlChunks(iu)) discovered.push(chunk);
        }
      }
    } catch (e: any) {
      console.log(
        JSON.stringify({
          enrichAttempt: 'getProductInfo_failed',
          message: e?.message || String(e),
        })
      );
    }
  }

  if ((!api || discovered.length === 0) && aeId) {
    const aff = await discoverViaAffiliate(product.userId, aeId, ship);
    if (aff.urls.length) {
      enrichPath = enrichPath === 'dropshipping' ? 'dropshipping_plus_affiliate' : 'affiliate';
      discovered.push(...aff.urls);
    } else {
      if (enrichPath === 'dropshipping') {
        enrichPath = `dropshipping_no_images;${aff.outcome}`;
      } else {
        enrichPath = !api ? `no_dropshipping_credentials;${aff.outcome}` : `no_source;${aff.outcome}`;
      }
      console.log(
        JSON.stringify({
          enrichAttempt: 'skipped_or_empty',
          dropshippingHadApi: !!api,
          reason: !api ? 'no_dropshipping_credentials' : 'dropshipping_returned_no_images',
          affiliateOutcome: aff.outcome,
        })
      );
    }
  } else if (!aeId) {
    console.log(JSON.stringify({ enrichAttempt: 'skipped', reason: 'no_aliexpress_product_id' }));
  }

  const merged = mergeUnique(existing, discovered);
  const changed = JSON.stringify(existing) !== JSON.stringify(merged);

  if (changed) {
    await prisma.product.update({
      where: { id: productId },
      data: { images: JSON.stringify(merged), updatedAt: new Date() },
    });
  }

  const norm0 = merged[0] ? normalizeAeImageUrl(merged[0]) : '';
  const secondNormDistinct =
    merged.length > 1 && merged.slice(1).some((u) => normalizeAeImageUrl(u) !== norm0);

  console.log(
    JSON.stringify(
      {
        productId,
        userId: product.userId,
        aeProductId: aeId,
        enrichPath,
        imageCountBefore: existing.length,
        imageCountAfter: merged.length,
        secondAngleNormDistinctFromFirst: secondNormDistinct,
        merged,
        dbUpdated: changed,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
