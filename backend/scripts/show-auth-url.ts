#!/usr/bin/env tsx
/**
 * Show AliExpress OAuth Authorization URL
 * Uses environment variables directly
 */

const APP_KEY = process.env.ALIEXPRESS_APP_KEY?.trim();
const REDIRECT_URI = process.env.ALIEXPRESS_REDIRECT_URI?.trim() || 'https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback';
const OAUTH_BASE = process.env.ALIEXPRESS_OAUTH_BASE || 'https://api-sg.aliexpress.com/oauth';

console.log('========================================================');
console.log('ALIEXPRESS OAUTH AUTHORIZATION URL');
console.log('========================================================\n');

if (!APP_KEY) {
  console.error('? ERROR: ALIEXPRESS_APP_KEY not found in environment');
  console.error('\nPlease set ALIEXPRESS_APP_KEY in your environment or .env file');
  process.exit(1);
}

const authUrl = `${OAUTH_BASE}/authorize?response_type=code&client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

console.log('? Authorization URL generated!\n');
console.log('?? INSTRUCTIONS:');
console.log('----------------------------------------');
console.log('1. Copy the URL below and open it in your browser');
console.log('2. Log in to your AliExpress account');
console.log('3. Authorize the application');
console.log('4. You will be redirected to the callback URL');
console.log('5. Copy the "code" parameter from the callback URL');
console.log('6. Run: npx tsx scripts/test-aliexpress-full-flow.ts YOUR_CODE\n');
console.log('?? AUTHORIZATION URL:');
console.log('----------------------------------------');
console.log(authUrl);
console.log('----------------------------------------\n');
console.log('?? After authorization, the callback URL will look like:');
console.log(`   ${REDIRECT_URI}?code=YOUR_CODE_HERE`);
console.log('   Copy the "code" value from the URL.\n');
