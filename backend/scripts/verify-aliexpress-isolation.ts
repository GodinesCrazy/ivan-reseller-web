/**
 * Verify strict isolation between AliExpress Affiliate and Dropshipping APIs.
 *
 * Checks:
 * 1) api_credentials separation by apiName/environment/user.
 * 2) Token separation (accessToken values are not reused across namespaces).
 * 3) executePurchase flow references dropshipping namespace only.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/verify-aliexpress-isolation.ts
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../src/config/database';
import { decrypt } from '../src/utils/encryption';

type CredRow = {
  id: number;
  userId: number;
  apiName: string;
  environment: string;
  isActive: boolean;
  credentials: string;
  updatedAt: Date;
};

function hashToken(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function safeParseCredentials(raw: string): Record<string, any> {
  try {
    return JSON.parse(decrypt(raw));
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  const rows = await prisma.apiCredential.findMany({
    where: {
      apiName: { in: ['aliexpress-affiliate', 'aliexpress-dropshipping'] },
    },
    select: {
      id: true,
      userId: true,
      apiName: true,
      environment: true,
      isActive: true,
      credentials: true,
      updatedAt: true,
    },
    orderBy: [{ userId: 'asc' }, { apiName: 'asc' }, { environment: 'asc' }],
  }) as CredRow[];

  const parsed = rows.map((r) => {
    const creds = safeParseCredentials(r.credentials);
    const accessToken = typeof creds.accessToken === 'string' ? creds.accessToken.trim() : '';
    const refreshToken = typeof creds.refreshToken === 'string' ? creds.refreshToken.trim() : '';
    return {
      ...r,
      hasAppKey: !!String(creds.appKey || '').trim(),
      hasAppSecret: !!String(creds.appSecret || '').trim(),
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
    };
  });

  const crossTokenReuses: Array<{
    userId: number;
    environment: string;
    tokenHash: string;
  }> = [];

  const byUserEnv = new Map<string, { aff?: typeof parsed[number]; ds?: typeof parsed[number] }>();
  for (const row of parsed) {
    const key = `${row.userId}:${row.environment}`;
    const v = byUserEnv.get(key) || {};
    if (row.apiName === 'aliexpress-affiliate') v.aff = row;
    if (row.apiName === 'aliexpress-dropshipping') v.ds = row;
    byUserEnv.set(key, v);
  }

  for (const [key, pair] of byUserEnv.entries()) {
    const [userIdStr, environment] = key.split(':');
    const userId = Number(userIdStr);
    if (!pair.aff || !pair.ds) continue;
    if (pair.aff.accessTokenHash && pair.ds.accessTokenHash && pair.aff.accessTokenHash === pair.ds.accessTokenHash) {
      crossTokenReuses.push({
        userId,
        environment,
        tokenHash: pair.aff.accessTokenHash,
      });
    }
  }

  const autoPurchasePath = path.resolve(__dirname, '../src/services/aliexpress-auto-purchase.service.ts');
  const checkoutPath = path.resolve(__dirname, '../src/services/aliexpress-checkout.service.ts');
  const autoPurchaseSource = fs.readFileSync(autoPurchasePath, 'utf8');
  const checkoutSource = fs.readFileSync(checkoutPath, 'utf8');

  const flowChecks = {
    usesDropshippingNamespace: autoPurchaseSource.includes("'aliexpress-dropshipping'"),
    usesAffiliateNamespaceInPurchaseFlow: autoPurchaseSource.includes('aliexpress-affiliate'),
    strictNoBrowserFallbackForUserId:
      autoPurchaseSource.includes('strict isolation: no browser fallback') &&
      checkoutSource.includes('strict isolation: no browser fallback'),
  };

  const result = {
    timestamp: new Date().toISOString(),
    counts: {
      totalRows: rows.length,
      affiliateRows: rows.filter((r) => r.apiName === 'aliexpress-affiliate').length,
      dropshippingRows: rows.filter((r) => r.apiName === 'aliexpress-dropshipping').length,
    },
    tokenSeparation: {
      crossTokenReusesFound: crossTokenReuses.length,
      details: crossTokenReuses,
    },
    flowChecks,
    rows: parsed.map((r) => ({
      id: r.id,
      userId: r.userId,
      apiName: r.apiName,
      environment: r.environment,
      isActive: r.isActive,
      hasAppKey: r.hasAppKey,
      hasAppSecret: r.hasAppSecret,
      accessTokenHash: r.accessTokenHash,
      refreshTokenHash: r.refreshTokenHash,
      updatedAt: r.updatedAt,
    })),
  };

  console.log(JSON.stringify(result, null, 2));

  const hasContamination =
    crossTokenReuses.length > 0 ||
    !flowChecks.usesDropshippingNamespace ||
    flowChecks.usesAffiliateNamespaceInPurchaseFlow;

  if (hasContamination) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('[verify-aliexpress-isolation] failed:', err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

