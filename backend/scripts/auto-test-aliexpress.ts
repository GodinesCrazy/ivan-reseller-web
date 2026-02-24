#!/usr/bin/env tsx
/**
 * Automatic AliExpress OAuth + Affiliate API Test
 * Attempts all possible ways to test without manual intervention
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import axios from 'axios';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { getOAuthStatus, getAuthorizationUrl } from '../src/services/aliexpress-oauth.service';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { getToken } from '../src/services/aliexpress-token.store';
import { prisma } from '../src/config/database';

const APP_KEY = process.env.ALIEXPRESS_APP_KEY;
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET;
const REDIRECT_URI = process.env.ALIEXPRESS_REDIRECT_URI;

async function checkBackendEndpoint() {
  const endpoints = [
    'http://localhost:3000',
    'http://localhost:5000',
    'https://ivan-reseller-backend-production.up.railway.app',
  ];

  for (const baseUrl of endpoints) {
    try {
      const url = `${baseUrl}/api/aliexpress/oauth/status`;
      const response = await axios.get(url, { timeout: 3000 });
      console.log(`? Backend found at: ${baseUrl}`);
      return baseUrl;
    } catch (e) {
      // Continue
    }
  }
  return null;
}

async function main() {
  console.log('========================================================');
  console.log('AUTOMATIC ALIEXPRESS OAUTH + AFFILIATE API TEST');
  console.log('========================================================\n');

  // Check credentials
  if (!APP_KEY || !APP_SECRET) {
    console.error('? ERROR: Credentials not configured');
    console.error('   APP_KEY:', APP_KEY ? 'SET' : 'MISSING');
    console.error('   APP_SECRET:', APP_SECRET ? 'SET' : 'MISSING');
    process.exit(1);
  }

  console.log('? Credentials configured');
  console.log(`   APP_KEY: ${APP_KEY.substring(0, 8)}...`);
  console.log(`   REDIRECT_URI: ${REDIRECT_URI}\n`);

  // Method 1: Check in-memory token
  console.log('?? METHOD 1: Checking in-memory token store...');
  const memoryToken = getToken();
  if (memoryToken?.accessToken) {
    const status = getOAuthStatus();
    if (!status.expired) {
      console.log('? Valid token found in memory!\n');
      return await testWithToken(memoryToken.accessToken);
    } else {
      console.log('? Token expired\n');
    }
  } else {
    console.log('? No token in memory\n');
  }

  // Method 2: Check database
  console.log('?? METHOD 2: Checking database...');
  try {
    const dbToken = await prisma.aliExpressToken.findUnique({
      where: { id: 'global' },
    });

    if (dbToken && dbToken.accessToken) {
      const isExpired = dbToken.expiresAt < new Date();
      if (!isExpired) {
        console.log('? Valid token found in database!\n');
        return await testWithToken(dbToken.accessToken);
      } else {
        console.log('? Token in database expired\n');
      }
    } else {
      console.log('? No token in database\n');
    }
  } catch (error: any) {
    console.log(`??  Error checking database: ${error.message}\n`);
  }

  // Method 3: Check if backend is running and has token
  console.log('?? METHOD 3: Checking backend endpoints...');
  const backendUrl = await checkBackendEndpoint();
  if (backendUrl) {
    try {
      const statusUrl = `${backendUrl}/api/aliexpress/oauth/status`;
      const response = await axios.get(statusUrl, { timeout: 5000 });
      if (response.data?.hasToken && !response.data?.expired) {
        console.log('? Backend has valid token!\n');
        // Try to use backend endpoint for testing
        try {
          const testUrl = `${backendUrl}/api/aliexpress/affiliate/debug-search`;
          const testResponse = await axios.get(testUrl, { timeout: 10000 });
          if (testResponse.data?.success && testResponse.data?.productsLength > 0) {
            console.log('?? SUCCESS: Backend API test passed!');
            console.log(`   Products returned: ${testResponse.data.productsLength}`);
            if (testResponse.data.products?.[0]) {
              console.log(`   Sample: ${testResponse.data.products[0].productTitle?.substring(0, 60)}...`);
            }
            console.log('\n? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED');
            process.exit(0);
          }
        } catch (e: any) {
          console.log(`??  Backend test failed: ${e.message}\n`);
        }
      }
    } catch (e: any) {
      console.log(`??  Backend status check failed: ${e.message}\n`);
    }
  } else {
    console.log('? Backend not accessible\n');
  }

  // Method 4: Generate authorization URL
  console.log('?? METHOD 4: Generating authorization URL...');
  try {
    const authUrl = getAuthorizationUrl();
    console.log('? Authorization URL generated\n');
    console.log('========================================================');
    console.log('??  MANUAL STEP REQUIRED');
    console.log('========================================================');
    console.log('No valid token found. You need to:');
    console.log('1. Open this URL in your browser:');
    console.log(`   ${authUrl}`);
    console.log('2. Authorize the app');
    console.log('3. Copy the code from callback URL');
    console.log('4. Run: npx tsx scripts/test-aliexpress-full-flow.ts YOUR_CODE\n');
  } catch (error: any) {
    console.error(`? Error generating URL: ${error.message}\n`);
  }

  process.exit(1);
}

async function testWithToken(accessToken: string) {
  console.log('?? Testing Affiliate API with token...');
  try {
    await aliexpressAffiliateAPIService.loadTokenFromDatabase();
    aliexpressAffiliateAPIService.setAccessToken(accessToken);

    const keywords = ['phone case', 'wireless earbuds', 'usb charger', 'led strip'];
    let successCount = 0;

    for (const keyword of keywords) {
      try {
        const products = await aliexpressAffiliateAPIService.searchProducts({
          keywords: keyword,
          pageNo: 1,
          pageSize: 5,
          shipToCountry: 'US',
        });

        if (products.length > 0) {
          successCount++;
          console.log(`? "${keyword}": ${products.length} products`);
          if (successCount === 1) {
            console.log(`   Sample: ${products[0].productTitle.substring(0, 60)}...`);
            console.log(`   Price: ${products[0].salePrice} ${products[0].currency || 'USD'}`);
          }
        } else {
          console.log(`??  "${keyword}": 0 products`);
        }
      } catch (error: any) {
        console.log(`? "${keyword}": ${error.message}`);
      }
    }

    if (successCount > 0) {
      console.log('\n========================================================');
      console.log('? VERIFICATION COMPLETE');
      console.log(`   Successful keywords: ${successCount}/${keywords.length}`);
      console.log(`   Access token: ${accessToken.substring(0, 10)}...${accessToken.slice(-6)}`);
      console.log('\n?? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED');
      console.log('========================================================\n');
      process.exit(0);
    } else {
      console.log('\n? No keywords returned products');
      console.log('   This may indicate affiliate permission not enabled');
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
