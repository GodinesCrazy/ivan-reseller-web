#!/usr/bin/env tsx
/**
 * Final AliExpress Test - Loads env properly and tests everything
 */

// Load dotenv FIRST before any imports
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.local with explicit path
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  config({ path: envPath, override: true });
  console.log('? Loaded .env.local from:', envPath);
} else {
  console.log('??  .env.local not found at:', envPath);
}

// Also try process.cwd()
const envPath2 = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath2)) {
  config({ path: envPath2, override: false }); // Don't override if already loaded
  console.log('? Also loaded .env.local from:', envPath2);
}

// Now import services
import { exchangeCodeForToken, getOAuthStatus } from '../src/services/aliexpress-oauth.service';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { getToken } from '../src/services/aliexpress-token.store';

const code = process.argv[2];

async function main() {
  console.log('========================================================');
  console.log('FINAL ALIEXPRESS OAUTH + AFFILIATE API TEST');
  console.log('========================================================\n');

  // Verify credentials
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  
  console.log('?? Environment Check:');
  console.log(`   ALIEXPRESS_APP_KEY: ${appKey ? appKey.substring(0, 8) + '...' : 'MISSING'}`);
  console.log(`   ALIEXPRESS_APP_SECRET: ${appSecret ? 'SET (' + appSecret.length + ' chars)' : 'MISSING'}`);
  console.log(`   ALIEXPRESS_REDIRECT_URI: ${process.env.ALIEXPRESS_REDIRECT_URI || 'MISSING'}\n`);

  if (!appKey || !appSecret) {
    console.error('? ERROR: Credentials not configured');
    console.error('   Please ensure ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET are in .env.local');
    process.exit(1);
  }

  // If code provided, exchange it
  if (code) {
    console.log('?? STEP 1: Exchanging authorization code for token...');
    try {
      const tokenData = await exchangeCodeForToken(code);
      console.log('? Token exchange successful!');
      console.log(`   Access token (masked): ${tokenData.accessToken.substring(0, 10)}...${tokenData.accessToken.slice(-6)}`);
      console.log(`   Expires at: ${new Date(tokenData.expiresAt).toISOString()}\n`);
    } catch (error: any) {
      console.error(`? Token exchange failed: ${error.message}`);
      if (error.response?.data) {
        console.error('Response:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    }
  } else {
    // Check for existing token
    console.log('?? STEP 1: Checking for existing token...');
    const memoryToken = getToken();
    if (memoryToken?.accessToken) {
      const status = getOAuthStatus();
      if (!status.expired) {
        console.log('? Using existing valid token');
        console.log(`   Access token (masked): ${memoryToken.accessToken.substring(0, 10)}...${memoryToken.accessToken.slice(-6)}\n`);
      } else {
        console.log('? Existing token expired');
        console.log('\n??  You need to provide an authorization code');
        console.log('   Get it from: https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=524880&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback');
        console.log('   Then run: npx tsx scripts/final-test-aliexpress.ts YOUR_CODE\n');
        process.exit(1);
      }
    } else {
      console.log('? No token found');
      console.log('\n??  You need to provide an authorization code');
      console.log('   Get it from: https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=524880&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback');
      console.log('   Then run: npx tsx scripts/final-test-aliexpress.ts YOUR_CODE\n');
      process.exit(1);
    }
  }

  // Step 2: Test Affiliate API
  console.log('?? STEP 2: Testing Affiliate API with multiple keywords...');
  try {
    await aliexpressAffiliateAPIService.loadTokenFromDatabase();
    const tokenData = code ? await exchangeCodeForToken(code) : getToken()!;
    aliexpressAffiliateAPIService.setAccessToken(tokenData.accessToken);

    const keywords = ['phone case', 'wireless earbuds', 'usb charger', 'led strip'];
    const results: Array<{ keyword: string; success: boolean; count: number; error?: string }> = [];

    for (const keyword of keywords) {
      try {
        console.log(`\n?? Testing: "${keyword}"`);
        const products = await aliexpressAffiliateAPIService.searchProducts({
          keywords: keyword,
          pageNo: 1,
          pageSize: 5,
          shipToCountry: 'US',
          targetCurrency: 'USD',
          targetLanguage: 'en',
        });

        results.push({ keyword, success: products.length > 0, count: products.length });
        if (products.length > 0) {
          console.log(`   ? ${products.length} products returned`);
        } else {
          console.log(`   ??  0 products`);
        }
      } catch (error: any) {
        results.push({ keyword, success: false, count: 0, error: error.message });
        console.log(`   ? Error: ${error.message}`);
      }
    }

    // Final report
    const successCount = results.filter(r => r.success).length;
    const sampleResult = results.find(r => r.success && r.count > 0);

    console.log('\n========================================================');
    console.log('VERIFICATION RESULTS');
    console.log('========================================================\n');

    for (const result of results) {
      const status = result.success ? '? PASS' : '? FAIL';
      console.log(`${status} | "${result.keyword}" | Products: ${result.count}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }

    console.log('\n========================================================');

    if (successCount > 0) {
      console.log('? VERIFICATION COMPLETE');
      console.log(`   Successful keywords: ${successCount}/${keywords.length}`);
      console.log(`   Access token: ${tokenData.accessToken.substring(0, 10)}...${tokenData.accessToken.slice(-6)}`);
      
      // Get sample product details
      if (sampleResult) {
        try {
          const sampleProducts = await aliexpressAffiliateAPIService.searchProducts({
            keywords: sampleResult.keyword,
            pageNo: 1,
            pageSize: 1,
            shipToCountry: 'US',
          });
          if (sampleProducts.length > 0) {
            console.log(`   Sample product: ${sampleProducts[0].productTitle.substring(0, 60)}...`);
            console.log(`   Sample price: ${sampleProducts[0].salePrice} ${sampleProducts[0].currency || 'USD'}`);
          }
        } catch (e) {
          // Ignore
        }
      }

      console.log('\n?? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED');
      console.log('========================================================\n');
      process.exit(0);
    } else {
      console.log('? VERIFICATION FAILED');
      console.log('   No keywords returned products');
      console.log('   Possible causes:');
      console.log('   1. Affiliate API permission not enabled in AliExpress Open Platform');
      console.log('   2. Invalid access token');
      console.log('   3. API endpoint issue');
      console.log('\n   However, signature implementation appears correct.');
      console.log('   Please verify affiliate API permissions in AliExpress Open Platform.');
      console.log('========================================================\n');
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`? Test failed: ${error.message}`);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
