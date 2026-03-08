#!/usr/bin/env tsx
/**
 * Direct AliExpress Dropshipping OAuth token exchange test (v2).
 *
 * Uses the corrected implementation: aliexpressDropshippingAPIService.exchangeCodeForToken
 * with TOP signature (appSecret + params + appSecret), GET to api-sg.aliexpress.com/rest/auth/token/create.
 *
 * Usage:
 *   npx tsx scripts/test-dropshipping-token-exchange-v2.ts "<OAUTH_CODE>"
 * or:
 *   set ALIEXPRESS_OAUTH_CODE=<OAUTH_CODE> && npx tsx scripts/test-dropshipping-token-exchange-v2.ts
 *
 * Requires: ALIEXPRESS_DROPSHIPPING_APP_KEY, ALIEXPRESS_DROPSHIPPING_APP_SECRET (env or .env.local)
 */

import 'dotenv/config';
import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';
import { getAliExpressDropshippingRedirectUri } from '../src/utils/aliexpress-dropshipping-oauth';

function required(name: string, value: string): string {
  if (!value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function mask(value: string, visible = 6): string {
  if (!value) return '(empty)';
  if (value.length <= visible) return '*'.repeat(value.length);
  return `${value.slice(0, visible)}...`;
}

async function main(): Promise<void> {
  const code = (process.argv[2] || process.env.ALIEXPRESS_OAUTH_CODE || '').trim();
  if (!code) {
    console.error('Missing OAuth code. Pass it as first arg or ALIEXPRESS_OAUTH_CODE env var.');
    console.error('');
    console.error('Usage:');
    console.error('  npx tsx scripts/test-dropshipping-token-exchange-v2.ts "3_522578_xxxxx"');
    console.error('  or: set ALIEXPRESS_OAUTH_CODE=3_522578_xxxxx && npx tsx scripts/test-dropshipping-token-exchange-v2.ts');
    process.exit(1);
  }

  const appKey = required(
    'ALIEXPRESS_DROPSHIPPING_APP_KEY',
    process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || ''
  );
  const appSecret = required(
    'ALIEXPRESS_DROPSHIPPING_APP_SECRET',
    process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || ''
  );
  const redirectUri = getAliExpressDropshippingRedirectUri();

  console.log('=== AliExpress Dropshipping OAuth Exchange Test (v2 - TOP signature) ===');
  console.log('appKey:', mask(appKey));
  console.log('redirectUri:', redirectUri);
  console.log('code:', mask(code));
  console.log('endpoint: https://api-sg.aliexpress.com/rest/auth/token/create');
  console.log('');

  try {
    const tokens = await aliexpressDropshippingAPIService.exchangeCodeForToken(
      code,
      redirectUri,
      appKey,
      appSecret
    );

    console.log('SUCCESS');
    console.log('accessToken:', tokens.accessToken ? mask(tokens.accessToken, 12) : '(empty)');
    console.log('refreshToken:', tokens.refreshToken ? mask(tokens.refreshToken, 12) : '(empty)');
    console.log('expiresIn:', tokens.expiresIn);
    console.log('refreshExpiresIn:', tokens.refreshExpiresIn);
    process.exit(0);
  } catch (error: any) {
    console.error('FAILED');
    console.error('message:', error?.message || String(error));
    if (error?.aliexpressRequestId) {
      console.error('request_id:', error.aliexpressRequestId);
    }
    if (error?.response?.data) {
      console.error('response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main().catch((error: any) => {
  console.error('[test-dropshipping-token-exchange-v2] error:', error?.message || error);
  process.exit(1);
});
