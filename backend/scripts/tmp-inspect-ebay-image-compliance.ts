#!/usr/bin/env tsx
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { CredentialsManager } from '../src/services/credentials-manager.service';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';
import { enforceEbayImageCompliance } from '../src/services/ebay-image-compliance.service';

const itemId = (process.argv[2] || '3256810520655465').trim();
const userId = Number(process.argv[3] || '1');

async function main() {
  const envAppKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
  const envAppSecret = (process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_APP_SECRET || '').trim();
  const trackingId = (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim();
  const envAffiliate = envAppKey && envAppSecret ? { appKey: envAppKey, appSecret: envAppSecret, trackingId, sandbox: false } : null;
  const affiliateCreds = envAffiliate ?? await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production');
  if (!affiliateCreds || !('appKey' in affiliateCreds) || !('appSecret' in affiliateCreds)) {
    throw new Error('missing affiliate creds');
  }
  aliexpressAffiliateAPIService.setCredentials(affiliateCreds as any);

  const dsCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
  if (!dsCreds?.accessToken) throw new Error('missing ds creds');
  aliexpressDropshippingAPIService.setCredentials(dsCreds as any);

  const details = await aliexpressAffiliateAPIService.getProductDetails({
    productIds: itemId,
    shipToCountry: 'US',
    targetCurrency: 'USD',
    targetLanguage: 'EN',
  });
  const detail = details?.[0] || null;
  const dsInfo = await aliexpressDropshippingAPIService.getProductInfo(itemId, { localCountry: 'US', localLanguage: 'en' });

  const images = [
    String(detail?.productMainImageUrl || '').trim(),
    ...((Array.isArray(detail?.productSmallImageUrls) ? detail.productSmallImageUrls : []) as unknown[])
      .map((v) => String(v || '').trim()),
    ...((Array.isArray(dsInfo.productImages) ? dsInfo.productImages : []) as unknown[])
      .map((v) => String(v || '').trim()),
  ].filter((u, i, arr) => Boolean(u) && arr.indexOf(u) === i);

  const comp = await enforceEbayImageCompliance(images, { maxImages: 24, concurrency: 2 });
  console.log(JSON.stringify({
    itemId,
    imageCount: images.length,
    acceptedCount: comp.acceptedUrls.length,
    acceptedUrls: comp.acceptedUrls,
    warnings: comp.warnings,
    audits: comp.audits.map((a) => ({
      sourceUrl: a.sourceUrl,
      accepted: a.accepted,
      reasons: a.reasons,
      warnings: a.warnings,
      format: a.format,
      width: a.width,
      height: a.height,
      longestSide: a.longestSide,
      complianceScore: a.complianceScore,
    })),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
