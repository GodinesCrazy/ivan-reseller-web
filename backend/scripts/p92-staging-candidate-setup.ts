/**
 * P92 — Controlled staging: resolve AliExpress DS product 1005009130509159, pick a SKU (default: any in-stock),
 * optionally create Product row and run Mercado Libre publish-preflight (read-only truth).
 *
 * Usage (from backend/):
 *   npx tsx scripts/p92-staging-candidate-setup.ts              # default --variant=first-in-stock
 *   npx tsx scripts/p92-staging-candidate-setup.ts --resolve-only
 *   npx tsx scripts/p92-staging-candidate-setup.ts --variant=gray|white|black|first-in-stock
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Prisma } from '@prisma/client';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const AE_PRODUCT_ID = '1005009130509159';
const AE_CANONICAL_URL = `https://www.aliexpress.com/item/${AE_PRODUCT_ID}.html`;
const ARTIFACT_DIR = path.join(__dirname, '..', '..', 'artifacts', 'p92');

const resolveOnly = process.argv.includes('--resolve-only');

function argvVariantFlag(): string | null {
  const raw = process.argv.find((a) => a.startsWith('--variant='));
  if (!raw) return null;
  return raw.split('=')[1]?.trim().toLowerCase() || null;
}

import type { DropshippingProductInfo, DropshippingSKU } from '../src/services/aliexpress-dropshipping-api.service';
import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import type { AliExpressDropshippingCredentials } from '../src/types/api-credentials.types';
import { prisma } from '../src/config/database';
import { buildMercadoLibrePublishPreflight } from '../src/services/mercadolibre-publish-preflight.service';

function mkdirArtifacts() {
  if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function skuLabel(sku: DropshippingSKU): string {
  return Object.entries(sku.attributes || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/** Match gray variant in English/Spanish AliExpress attribute text (no fabrication). */
function isGrayVariantSku(sku: DropshippingSKU): boolean {
  const blob = skuLabel(sku).toLowerCase();
  return /\b(gray|grey|gris)\b/i.test(blob);
}

function isWhiteVariantSku(sku: DropshippingSKU): boolean {
  const blob = skuLabel(sku).toLowerCase();
  return /\b(white|blanco)\b/i.test(blob);
}

function isBlackVariantSku(sku: DropshippingSKU): boolean {
  const blob = skuLabel(sku).toLowerCase();
  return /\b(black|negro)\b/i.test(blob);
}

function pickSkuByVariantIntent(info: DropshippingProductInfo, variant: string): DropshippingSKU | null {
  const skus = info.skus || [];
  const inStock = (s: DropshippingSKU) => (s.stock ?? 0) > 0;
  if (variant === 'gray') {
    const gray = skus.filter(isGrayVariantSku).filter(inStock);
    if (gray.length > 0) return gray[0]!;
    const grayAny = skus.filter(isGrayVariantSku);
    return grayAny[0] ?? null;
  }
  if (variant === 'white') {
    const w = skus.filter(isWhiteVariantSku).filter(inStock);
    if (w.length > 0) return w[0]!;
    const wAny = skus.filter(isWhiteVariantSku);
    return wAny[0] ?? null;
  }
  if (variant === 'black') {
    const b = skus.filter(isBlackVariantSku).filter(inStock);
    if (b.length > 0) return b[0]!;
    const bAny = skus.filter(isBlackVariantSku);
    return bAny[0] ?? null;
  }
  if (variant === 'first-in-stock') {
    const f = skus.filter(inStock);
    if (f.length > 0) return f[0]!;
    return skus[0] ?? null;
  }
  return null;
}

function collectColorHints(skus: DropshippingSKU[]): string[] {
  const out: string[] = [];
  for (const s of skus) {
    const attrs = s.attributes || {};
    const color = attrs.Color ?? attrs.color ?? attrs.Colour ?? attrs.colour;
    if (typeof color === 'string' && color.trim()) out.push(color.trim());
  }
  return out;
}

/**
 * Same resolution order as runtime: per-user + global + env merge inside getCredentialEntry.
 * Scans all users and both environments — P92 was failing when only userId 1 lacked DS OAuth.
 */
async function resolveDsCredentialsAndUserId(): Promise<{
  creds: AliExpressDropshippingCredentials;
  credentialUserId: number;
  environment: 'sandbox' | 'production';
} | null> {
  const users = await prisma.user.findMany({
    orderBy: { id: 'asc' },
    take: 100,
    select: { id: true },
  });
  for (const u of users) {
    for (const environment of ['production', 'sandbox'] as const) {
      const entry = await CredentialsManager.getCredentialEntry(u.id, 'aliexpress-dropshipping', environment);
      const c = entry?.credentials as AliExpressDropshippingCredentials | undefined;
      if (c?.appKey && c.appSecret && String(c.accessToken || '').trim()) {
        return { creds: c, credentialUserId: u.id, environment };
      }
    }
  }
  return null;
}

async function main() {
  mkdirArtifacts();
  const variantFromArgv = argvVariantFlag();
  const variantIntent = variantFromArgv || 'first-in-stock';

  const summary: Record<string, unknown> = {
    aeProductId: AE_PRODUCT_ID,
    variantIntent,
    timestamp: new Date().toISOString(),
  };

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    summary.blocker = 'database_no_user';
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'p92-resolution.json'), JSON.stringify(summary, null, 2));
    console.error('P92: No user in database — cannot attach Product.');
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }

  const resolved = await resolveDsCredentialsAndUserId();
  if (!resolved) {
    summary.blocker = 'credentials_missing_or_no_token';
    summary.hint =
      'No user has aliexpress-dropshipping with accessToken. Set ALIEXPRESS_DROPSHIPPING_APP_KEY, APP_SECRET, ACCESS_TOKEN in .env.local (merged for user 1+) or complete DS OAuth in API settings for any user.';
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'p92-resolution.json'), JSON.stringify(summary, null, 2));
    console.error('P92:', summary.hint);
    await prisma.$disconnect().catch(() => {});
    process.exit(2);
  }

  const { creds, credentialUserId, environment: dsEnvironment } = resolved;
  summary.dsCredentialUserId = credentialUserId;
  summary.dsCredentialEnvironment = dsEnvironment;
  const userId = credentialUserId;

  aliexpressDropshippingAPIService.setCredentials(creds);

  let info: DropshippingProductInfo;
  try {
    info = await aliexpressDropshippingAPIService.getProductInfo(AE_PRODUCT_ID, {
      localCountry: 'CL',
      localLanguage: 'es',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    summary.blocker = 'api_error';
    summary.error = msg;
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'p92-resolution.json'), JSON.stringify(summary, null, 2));
    console.error('P92: getProductInfo failed:', msg);
    await prisma.$disconnect().catch(() => {});
    process.exit(3);
  }

  const pickedSku = pickSkuByVariantIntent(info, variantIntent);
  const skuSummaries = (info.skus || []).map((s) => ({
    skuId: s.skuId,
    stock: s.stock,
    salePrice: s.salePrice,
    label: skuLabel(s),
    colorHint: (s.attributes?.Color ?? s.attributes?.color) as string | undefined,
  }));

  summary.ds = {
    productTitle: info.productTitle,
    currency: info.currency,
    baseSalePrice: info.salePrice,
    imageCount: info.productImages?.length ?? 0,
    skuCount: info.skus?.length ?? 0,
    skuSummaries,
    colorValuesFromAttributes: collectColorHints(info.skus || []),
  };

  if (!pickedSku) {
    summary.blocker = `variant_sku_not_found:${variantIntent}`;
    summary.skuSummaries = skuSummaries;
    summary.hint =
      variantIntent === 'gray'
        ? 'No gray/grey/gris SKU in DS. Use --variant=white, --variant=black, or omit flag for first-in-stock (any variant).'
        : `No SKU matched --variant=${variantIntent}. For any purchasable row, omit --variant (first-in-stock) or fix DS response.`;
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'p92-resolution.json'), JSON.stringify(summary, null, 2));
    console.error('P92:', summary.hint);
    await prisma.$disconnect().catch(() => {});
    process.exit(4);
  }

  summary.skuResolution = {
    variantIntent,
    skuId: pickedSku.skuId,
    salePrice: pickedSku.salePrice,
    stock: pickedSku.stock,
    attributes: pickedSku.attributes,
    label: skuLabel(pickedSku),
  };

  fs.writeFileSync(path.join(ARTIFACT_DIR, 'p92-ds-product-info.json'), JSON.stringify(summary, null, 2));
  console.log('P92 DS OK — skuId:', pickedSku.skuId, 'variant:', variantIntent, 'stock:', pickedSku.stock, 'price:', pickedSku.salePrice);

  if (resolveOnly) {
    console.log('P92 --resolve-only: skipping DB and preflight.');
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  }

  const normalizedUrl = AE_CANONICAL_URL.toLowerCase().replace(/\/+$/, '');
  const existing = await prisma.product.findFirst({
    where: {
      userId,
      OR: [
        { aliexpressUrl: { contains: AE_PRODUCT_ID } },
        { aliexpressUrl: { equals: normalizedUrl, mode: 'insensitive' } },
      ],
    },
    select: { id: true, aliexpressSku: true, status: true },
  });

  let productId: number;
  if (existing) {
    productId = existing.id;
    await prisma.product.update({
      where: { id: productId },
      data: {
        aliexpressSku: pickedSku.skuId,
        targetCountry: 'CL',
        originCountry: 'CN',
        title: info.productTitle.slice(0, 200),
        aliexpressPrice: new Prisma.Decimal(String(pickedSku.salePrice)),
        suggestedPrice: new Prisma.Decimal(String(Math.max(pickedSku.salePrice * 2.2, pickedSku.salePrice + 0.01))),
        finalPrice: new Prisma.Decimal(String(Math.max(pickedSku.salePrice * 2.2, pickedSku.salePrice + 0.01))),
        currency: info.currency || 'USD',
        images: JSON.stringify((info.productImages || []).slice(0, 12).filter(Boolean)),
      },
    });
    summary.productAction = 'updated_existing';
    console.log('P92: Updated existing product id', productId);
  } else {
    const created = await prisma.product.create({
      data: {
        userId,
        aliexpressUrl: AE_CANONICAL_URL,
        title: info.productTitle.slice(0, 200),
        description: null,
        aliexpressPrice: new Prisma.Decimal(String(pickedSku.salePrice)),
        suggestedPrice: new Prisma.Decimal(String(Math.max(pickedSku.salePrice * 2.2, pickedSku.salePrice + 0.01))),
        finalPrice: new Prisma.Decimal(String(Math.max(pickedSku.salePrice * 2.2, pickedSku.salePrice + 0.01))),
        currency: info.currency || 'USD',
        category: null,
        images: JSON.stringify((info.productImages || []).slice(0, 12).filter(Boolean)),
        productData: JSON.stringify({
          p92StagingCandidate: true,
          aeProductId: AE_PRODUCT_ID,
          variantIntent,
        }),
        status: 'PENDING',
        isPublished: false,
        targetCountry: 'CL',
        originCountry: 'CN',
        aliexpressSku: pickedSku.skuId,
      },
      select: { id: true },
    });
    productId = created.id;
    summary.productAction = 'created';
    console.log('P92: Created product id', productId);
  }

  summary.internalProductId = productId;

  let preflight: Awaited<ReturnType<typeof buildMercadoLibrePublishPreflight>> | null = null;
  try {
    preflight = await buildMercadoLibrePublishPreflight({
      userId,
      productId,
      isAdmin: true,
    });
    summary.preflight = {
      overallState: preflight.overallState,
      publishAllowed: preflight.publishAllowed,
      blockers: preflight.blockers,
      nextAction: preflight.nextAction,
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, `p92-preflight-product-${productId}.json`), JSON.stringify(preflight, null, 2));
    console.log('P92 preflight:', preflight.overallState, 'publishAllowed=', preflight.publishAllowed);
  } catch (e: unknown) {
    summary.preflightError = e instanceof Error ? e.message : String(e);
    console.error('P92 preflight failed:', summary.preflightError);
  }

  fs.writeFileSync(path.join(ARTIFACT_DIR, 'p92-resolution.json'), JSON.stringify(summary, null, 2));
  await prisma.$disconnect().catch(() => {});
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(99);
});
