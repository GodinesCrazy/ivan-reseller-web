#!/usr/bin/env tsx
/**
 * Direct AliExpress Dropshipping OAuth token exchange test.
 *
 * Goal:
 * - Reproduce/validate token exchange outside the web callback flow.
 * - Confirm request format is x-www-form-urlencoded.
 *
 * Usage:
 *   npx tsx scripts/test-dropshipping-token-exchange.ts "<OAUTH_CODE>"
 * or:
 *   set ALIEXPRESS_OAUTH_CODE=<OAUTH_CODE> && npx tsx scripts/test-dropshipping-token-exchange.ts
 */

import 'dotenv/config';
import axios from 'axios';
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
    throw new Error(
      'Missing OAuth code. Pass it as first arg or ALIEXPRESS_OAUTH_CODE env var.'
    );
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
  const tokenUrl = 'https://auth.aliexpress.com/oauth/token';

  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: appKey,
    client_secret: appSecret,
    code,
    redirect_uri: redirectUri,
  });

  console.log('=== AliExpress Dropshipping OAuth Exchange Test ===');
  console.log('tokenUrl:', tokenUrl);
  console.log('contentType: application/x-www-form-urlencoded');
  console.log('appKey:', mask(appKey));
  console.log('redirectUri:', redirectUri);
  console.log('code:', mask(code));

  try {
    const response = await axios.post(tokenUrl, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    console.log('status:', response.status);
    console.log('statusText:', response.statusText || '(none)');
    console.log('response:', JSON.stringify(response.data, null, 2));

    if (response.status >= 400) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error('[test-dropshipping-token-exchange] request failed');
    console.error('message:', error?.message || 'unknown');
    console.error('status:', error?.response?.status || '(none)');
    console.error('response:', JSON.stringify(error?.response?.data || {}, null, 2));
    process.exit(1);
  }
}

main().catch((error: any) => {
  console.error('[test-dropshipping-token-exchange] failed:', error?.message || error);
  process.exit(1);
});
