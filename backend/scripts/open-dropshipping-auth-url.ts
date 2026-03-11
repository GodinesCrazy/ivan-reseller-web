#!/usr/bin/env tsx
/**
 * Opens AliExpress Dropshipping OAuth authorization URL in the browser.
 * Usage: npx tsx scripts/open-dropshipping-auth-url.ts
 */

import 'dotenv/config';
import { getAliExpressDropshippingRedirectUri } from '../src/utils/aliexpress-dropshipping-oauth';

const appKey = (process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
const redirectUri = getAliExpressDropshippingRedirectUri();
const state = 'ivanreseller';

if (!appKey) {
  console.error('ERROR: ALIEXPRESS_DROPSHIPPING_APP_KEY not found. Set it in .env.local');
  process.exit(1);
}

const params = new URLSearchParams({
  response_type: 'code',
  force_auth: 'true',
  client_id: appKey,
  redirect_uri: redirectUri,
  state,
});

const authUrl = `https://api-sg.aliexpress.com/oauth/authorize?${params.toString()}`;

console.log('Opening AliExpress Dropshipping OAuth URL in browser...');
console.log('redirectUri:', redirectUri);
console.warn('Note: This script uses state=ivanreseller. For production OAuth, prefer the dashboard flow: api-settings → Autorizar.');
console.log('');

const { execSync } = require('child_process');
let openCmd: string;
if (process.platform === 'win32') {
  openCmd = `powershell -Command "Start-Process '${authUrl.replace(/'/g, "''")}'"`;
} else if (process.platform === 'darwin') {
  openCmd = `open "${authUrl}"`;
} else {
  openCmd = `xdg-open "${authUrl}"`;
}
execSync(openCmd, { stdio: 'inherit', shell: true });

console.log('After authorizing, copy the "code" from the callback URL and run:');
console.log('  npx tsx scripts/test-dropshipping-token-exchange-v2.ts "YOUR_CODE"');
