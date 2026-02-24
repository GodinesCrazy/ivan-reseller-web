#!/usr/bin/env tsx
/**
 * Complete AliExpress Test - Just provide the code and it does everything
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { exchangeCodeForToken } from '../src/services/aliexpress-oauth.service';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';

const code = process.argv[2];

if (!code) {
  console.log('========================================================');
  console.log('ALIEXPRESS COMPLETE TEST');
  console.log('========================================================\n');
  console.log('? ERROR: Authorization code required\n');
  console.log('?? To get the code:');
  console.log('1. Open this URL in your browser:');
  console.log('   https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=524880&redirect_uri=https%3A%2F%2Fivan-reseller-backend-production.up.railway.app%2Fapi%2Faliexpress%2Fcallback');
  console.log('2. Authorize the app');
  console.log('3. Copy the "code" from the callback URL');
  console.log('4. Run: npx tsx scripts/complete-test-with-code.ts YOUR_CODE\n');
  process.exit(1);
}

async function main() {
  console.log('========================================================');
  console.log('ALIEXPRESS COMPLETE TEST');
  console.log('========================================================\n');

  // Step 1: Exchange code for token
  console.log('?? STEP 1: Exchanging code for token...');
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

  // Step 2: Load token and test API
  console.log('?? STEP 2: Loading token and testing Affiliate API...');
  try {
    await aliexpressAffiliateAPIService.loadTokenFromDatabase();
    const tokenData = await exchangeCodeForToken(code); // Get fresh token
    aliexpressAffiliateAPIService.setAccessToken(tokenData.accessToken);

    const keywords = ['phone case', 'wireless earbuds', 'usb charger', 'led strip'];
    let successCount = 0;
    let sampleProduct: any = null;

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

        if (products.length > 0) {
          successCount++;
          console.log(`   ? ${products.length} products returned`);
          if (!sampleProduct) {
            sampleProduct = products[0];
          }
        } else {
          console.log(`   ??  0 products`);
        }
      } catch (error: any) {
        console.log(`   ? Error: ${error.message}`);
      }
    }

    // Final report
    console.log('\n========================================================');
    if (successCount > 0) {
      console.log('? VERIFICATION COMPLETE');
      console.log(`   Successful keywords: ${successCount}/${keywords.length}`);
      if (sampleProduct) {
        console.log(`   Sample product: ${sampleProduct.productTitle.substring(0, 60)}...`);
        console.log(`   Sample price: ${sampleProduct.salePrice} ${sampleProduct.currency || 'USD'}`);
      }
      console.log('\n?? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED');
      console.log('========================================================\n');
      process.exit(0);
    } else {
      console.log('? VERIFICATION FAILED');
      console.log('   No keywords returned products');
      console.log('   This may indicate affiliate permission not enabled');
      console.log('========================================================\n');
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`? Test failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
