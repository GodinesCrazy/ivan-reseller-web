/**
 * Check possible physical package sources for product 32714.
 * Writes result to repo root as p95-package-source.json.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { aliExpressSupplierAdapter } from '../src/services/adapters/aliexpress-supplier.adapter';
import {
  aliexpressDropshippingAPIService,
  refreshAliExpressDropshippingToken,
} from '../src/services/aliexpress-dropshipping-api.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';

const PRODUCT_ID = 32714;
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'p95-package-source.json');

function safeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function extractKeywordPaths(node: unknown, keyword: RegExp, base = ''): string[] {
  const found: string[] = [];
  if (node === null || node === undefined) return found;

  if (Array.isArray(node)) {
    node.forEach((entry, index) => {
      const next = base ? `${base}[${index}]` : `[${index}]`;
      found.push(...extractKeywordPaths(entry, keyword, next));
    });
    return found;
  }

  if (typeof node !== 'object') return found;

  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const next = base ? `${base}.${k}` : k;
    if (keyword.test(k)) {
      found.push(next);
    }
    found.push(...extractKeywordPaths(v, keyword, next));
  }

  return found;
}

function collectNumericCandidates(
  node: unknown,
  keyPattern: RegExp,
  base = ''
): Array<{ path: string; value: number }> {
  const out: Array<{ path: string; value: number }> = [];
  if (node === null || node === undefined) return out;

  if (Array.isArray(node)) {
    node.forEach((entry, index) => {
      out.push(...collectNumericCandidates(entry, keyPattern, `${base}[${index}]`));
    });
    return out;
  }

  if (typeof node !== 'object') return out;

  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const next = base ? `${base}.${k}` : k;
    if (keyPattern.test(k)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.push({ path: next, value: n });
      if (typeof v === 'string') {
        const parsed = Number(String(v).replace(',', '.').trim());
        if (Number.isFinite(parsed) && parsed > 0) out.push({ path: next, value: parsed });
      }
    }
    out.push(...collectNumericCandidates(v, keyPattern, next));
  }

  return out;
}

async function main() {
  const out: Record<string, unknown> = {
    productId: PRODUCT_ID,
    at: new Date().toISOString(),
  };

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: {
      id: true,
      userId: true,
      title: true,
      aliexpressUrl: true,
      aliexpressSku: true,
      packageWeightGrams: true,
      packageLengthCm: true,
      packageWidthCm: true,
      packageHeightCm: true,
      maxUnitsPerOrder: true,
      productData: true,
    },
  });
  if (!product) throw new Error(`Product ${PRODUCT_ID} not found`);

  const productData = safeJson(product.productData);
  out.dbPackage = {
    packageWeightGrams: product.packageWeightGrams,
    packageLengthCm: product.packageLengthCm,
    packageWidthCm: product.packageWidthCm,
    packageHeightCm: product.packageHeightCm,
    maxUnitsPerOrder: product.maxUnitsPerOrder,
  };
  out.productDataKeywordPaths = extractKeywordPaths(
    productData,
    /(weight|length|width|height|dimension|package|volum|grams|kg)/i
  ).slice(0, 250);

  const aeProductId = aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl || '');
  out.aeProductId = aeProductId || null;
  if (!aeProductId) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2), 'utf8');
    return;
  }

  await refreshAliExpressDropshippingToken(product.userId, 'production', { minTtlMs: 60_000 });
  const creds = (await CredentialsManager.getCredentials(
    product.userId,
    'aliexpress-dropshipping',
    'production'
  )) as Record<string, unknown> | null;
  if (!creds?.appKey || !creds?.appSecret || !creds?.accessToken) {
    throw new Error('AliExpress dropshipping credentials/token missing');
  }
  aliexpressDropshippingAPIService.setCredentials(creds as any);

  const info = await aliexpressDropshippingAPIService.getProductInfo(aeProductId, {
    localCountry: 'CL',
    localLanguage: 'es',
  });
  const rawResult = await (aliexpressDropshippingAPIService as any).makeRequest('aliexpress.ds.product.get', {
    product_id: aeProductId,
    ship_to_country: 'CL',
    shipToCountry: 'CL',
    local_country: 'CL',
    local_language: 'es',
  });
  const rawProduct = (rawResult as any)?.result ?? (rawResult as any)?.product ?? rawResult ?? {};
  const packageInfo =
    rawProduct && typeof rawProduct === 'object'
      ? ((rawProduct as Record<string, unknown>).package_info_dto as Record<string, unknown>) || {}
      : {};
  const logistics = info.logisticsInfoDto && typeof info.logisticsInfoDto === 'object'
    ? (info.logisticsInfoDto as Record<string, unknown>)
    : {};

  const skuSample = Array.isArray(info.skus) ? info.skus.slice(0, 5) : [];

  out.aliexpress = {
    title: info.productTitle,
    salePrice: info.salePrice,
    currency: info.currency,
    stock: info.stock,
    skuCount: Array.isArray(info.skus) ? info.skus.length : 0,
    logisticsKeywordPaths: extractKeywordPaths(
      logistics,
      /(weight|length|width|height|dimension|package|volum|grams|kg)/i
    ).slice(0, 250),
    logisticsTopKeys: Object.keys(logistics).slice(0, 100),
    packageInfoKeywordPaths: extractKeywordPaths(
      packageInfo,
      /(weight|length|width|height|dimension|package|volum|grams|kg|cm|mm)/i
    ).slice(0, 250),
    packageInfoTopKeys: Object.keys(packageInfo).slice(0, 100),
    packageInfoRaw: packageInfo,
    packageInfoNumericCandidates: {
      weight: collectNumericCandidates(packageInfo, /(weight|gross|net|gram|kg)/i).slice(0, 40),
      length: collectNumericCandidates(packageInfo, /(length|long|len)/i).slice(0, 40),
      width: collectNumericCandidates(packageInfo, /(width|wide)/i).slice(0, 40),
      height: collectNumericCandidates(packageInfo, /(height|high)/i).slice(0, 40),
    },
    skuKeywordPaths: extractKeywordPaths(
      skuSample,
      /(weight|length|width|height|dimension|package|volum|grams|kg)/i
    ).slice(0, 250),
    skuSample,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Package source report written to ${OUTPUT_FILE}`);
}

main()
  .catch((e) => {
    const out = {
      productId: PRODUCT_ID,
      at: new Date().toISOString(),
      fatalError: e instanceof Error ? e.message : String(e),
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2), 'utf8');
    console.error(out.fatalError);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
