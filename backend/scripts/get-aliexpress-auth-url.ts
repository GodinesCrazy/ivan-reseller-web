#!/usr/bin/env tsx
/**
 * Get AliExpress OAuth Authorization URL
 * 
 * This script generates the authorization URL that you need to visit
 * to get an authorization code for token exchange.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

// Load .env.local if it exists (same as test script)
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { getAuthorizationUrl } from '../src/services/aliexpress-oauth.service';

async function main() {
  console.log('========================================================');
  console.log('ALIEXPRESS OAUTH AUTHORIZATION URL GENERATOR');
  console.log('========================================================\n');

  try {
    const authUrl = getAuthorizationUrl();
    
    console.log('? Authorization URL generated successfully!\n');
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
    console.log('   https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback?code=YOUR_CODE_HERE');
    console.log('   Copy the "code" value from the URL.\n');
    
  } catch (error: any) {
    console.error('? ERROR:', error.message);
    console.error('\nPlease ensure:');
    console.error('  - ALIEXPRESS_APP_KEY is set');
    console.error('  - ALIEXPRESS_APP_SECRET is set');
    console.error('  - ALIEXPRESS_REDIRECT_URI is set');
    process.exit(1);
  }
}

main();
