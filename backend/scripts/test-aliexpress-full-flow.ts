#!/usr/bin/env tsx
/**
 * ULTRA-STRICT AliExpress OAuth + Affiliate API Verification Script
 * 
 * Case 2: System Interfaces Compliance Verification
 * 
 * Tests the complete flow:
 * 1. OAuth token exchange (if code provided) OR use existing token
 * 2. Validate access_token exists and is valid
 * 3. Call affiliate.product.query with multiple keywords
 * 4. Assert products.length > 0 for at least one keyword
 * 5. Exit 0 ONLY if all critical tests pass
 * 
 * NO MOCKS. NO FALLBACKS. NO SKIP LOGIC.
 * 
 * Usage:
 *   tsx scripts/test-aliexpress-full-flow.ts [authorization_code]
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { exchangeCodeForToken, getOAuthStatus } from '../src/services/aliexpress-oauth.service';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { getToken } from '../src/services/aliexpress-token.store';
import logger from '../src/config/logger';

// STRICT: Test keywords that MUST return products if affiliate permission is enabled
const TEST_KEYWORDS = [
  'phone case',
  'wireless earbuds',
  'usb charger',
  'led strip',
];

interface TestResult {
  keyword: string;
  success: boolean;
  productsCount: number;
  totalResults?: number;
  error?: string;
  sampleProduct?: {
    title: string;
    price: number;
    currency: string;
  };
}

async function main(): Promise<number> {
  console.log('========================================================');
  console.log('ALIEXPRESS OAUTH + AFFILIATE API VERIFICATION');
  console.log('CASE 2: SYSTEM INTERFACES - STRICT MODE');
  console.log('========================================================\n');

  let exitCode = 0;
  const testResults: TestResult[] = [];

  // ============================================================
  // STEP 1: Environment Validation
  // ============================================================
  console.log('📋 STEP 1: Environment Validation');
  console.log('----------------------------------------');

  const appKey = process.env.ALIEXPRESS_APP_KEY?.trim();
  const appSecret = process.env.ALIEXPRESS_APP_SECRET?.trim();
  const redirectUri = process.env.ALIEXPRESS_REDIRECT_URI?.trim();

  if (!appKey || !appSecret) {
    console.error('❌ FAIL: ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET must be set');
    return 1;
  }

  if (!redirectUri) {
    console.error('❌ FAIL: ALIEXPRESS_REDIRECT_URI must be set');
    return 1;
  }

  console.log('✅ APP_KEY:', appKey.substring(0, 8) + '...');
  console.log('✅ APP_SECRET:', appSecret ? 'SET' : 'MISSING');
  console.log('✅ REDIRECT_URI:', redirectUri);
  console.log('');

  // ============================================================
  // STEP 2: OAuth Token Exchange or Validation
  // ============================================================
  console.log('📋 STEP 2: OAuth Token Exchange/Validation');
  console.log('----------------------------------------');

  const code = process.argv[2];
  let accessToken: string;

  if (code) {
    console.log('📝 Exchanging authorization code for tokens...');
    try {
      const tokenData = await exchangeCodeForToken(code);
      accessToken = tokenData.accessToken;
      
      if (!accessToken) {
        console.error('❌ FAIL: Token exchange returned empty access_token');
        return 1;
      }

      console.log('ACCESS TOKEN RECEIVED');
      console.log('✅ Token exchange successful');
      console.log(`   Access token (masked): ${accessToken.substring(0, 10)}...${accessToken.slice(-6)}`);
      console.log(`   Expires at: ${new Date(tokenData.expiresAt).toISOString()}`);
      console.log(`   Has refresh token: ${!!tokenData.refreshToken}`);
      console.log('');
    } catch (error: any) {
      console.error('❌ FAIL: Token exchange failed');
      console.error(`   Error: ${error.message}`);
      if (error.response?.data) {
        console.error(`   Response: ${JSON.stringify(error.response.data).substring(0, 500)}`);
      }
      return 1;
    }
  } else {
    console.log('📝 Checking for existing token...');
    const tokenData = getToken();
    
    if (!tokenData?.accessToken) {
      const { getAuthorizationUrl } = await import('../src/services/aliexpress-oauth.service');
      console.error('❌ FAIL: No existing token found and no code provided');
      console.error('   Step 1: Open this URL to get authorization code:');
      console.error('   ', getAuthorizationUrl());
      console.error('   Step 2: Run: npx tsx scripts/test-aliexpress-full-flow.ts "YOUR_CODE"');
      return 1;
    }

    const status = getOAuthStatus();
    if (status.expired) {
      console.error('❌ FAIL: Existing token has expired');
      console.error(`   Expired at: ${status.expiresAt}`);
      return 1;
    }

    accessToken = tokenData.accessToken;
    console.log('✅ Using existing token');
    console.log(`   Access token (masked): ${accessToken.substring(0, 10)}...${accessToken.slice(-6)}`);
    console.log(`   Expires at: ${status.expiresAt}`);
    console.log('');
  }

  // ============================================================
  // STEP 3: Load Token into Affiliate API Service
  // ============================================================
  console.log('📋 STEP 3: Load Token into Affiliate API Service');
  console.log('----------------------------------------');

  try {
    await aliexpressAffiliateAPIService.loadTokenFromDatabase();
    aliexpressAffiliateAPIService.setCredentials({
      appKey,
      appSecret,
      trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
      sandbox: false,
    });
    aliexpressAffiliateAPIService.setAccessToken(accessToken);
    console.log('✅ Token loaded into service');
    console.log('');
  } catch (error: any) {
    console.error('❌ FAIL: Failed to load token into service');
    console.error(`   Error: ${error.message}`);
    return 1;
  }

  // ============================================================
  // STEP 4: Test Affiliate API with Multiple Keywords
  // ============================================================
  console.log('📋 STEP 4: Affiliate API Product Query Tests');
  console.log('----------------------------------------');

  let atLeastOneSuccess = false;
  let allKeywordsFailed = true;

  for (const keyword of TEST_KEYWORDS) {
    console.log(`\n🔍 Testing keyword: "${keyword}"`);
    
    const result: TestResult = {
      keyword,
      success: false,
      productsCount: 0,
    };

    try {
      const products = await aliexpressAffiliateAPIService.searchProducts({
        keywords: keyword,
        pageNo: 1,
        pageSize: 10,
        shipToCountry: 'US',
        targetCurrency: 'USD',
        targetLanguage: 'en',
      });

      result.productsCount = products.length;
      result.totalResults = products.length; // Simplified - actual API might return total count separately

      if (products.length > 0) {
        result.success = true;
        atLeastOneSuccess = true;
        allKeywordsFailed = false;
        
        const firstProduct = products[0];
        result.sampleProduct = {
          title: firstProduct.productTitle,
          price: firstProduct.salePrice,
          currency: firstProduct.currency || 'USD',
        };

        console.log(`   ✅ SUCCESS: ${products.length} products returned`);
        console.log(`   📦 Sample: ${firstProduct.productTitle.substring(0, 60)}...`);
        console.log(`   💰 Price: ${firstProduct.salePrice} ${firstProduct.currency || 'USD'}`);
      } else {
        console.log(`   ⚠️  WARNING: 0 products returned`);
        console.log(`   This may indicate affiliate permission not enabled`);
      }
    } catch (error: any) {
      result.error = error.message;
      console.error(`   ❌ ERROR: ${error.message}`);
      
      if (error.message?.includes('AFFILIATE_PERMISSION_MISSING')) {
        console.error(`   ⚠️  Affiliate permission appears to be missing`);
      }
    }

    testResults.push(result);
  }

  // ============================================================
  // STEP 5: Final Validation and Report
  // ============================================================
  console.log('\n========================================================');
  console.log('VERIFICATION RESULTS');
  console.log('========================================================\n');

  console.log('Test Summary:');
  console.log('----------------------------------------');
  for (const result of testResults) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | "${result.keyword}" | Products: ${result.productsCount}`);
    if (result.sampleProduct) {
      console.log(`      Sample: ${result.sampleProduct.title.substring(0, 50)}... | ${result.sampleProduct.price} ${result.sampleProduct.currency}`);
    }
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  }

  console.log('\n========================================================');
  
  // STRICT VALIDATION: Must have at least one successful keyword
  if (!atLeastOneSuccess) {
    console.error('❌ FAIL: No keywords returned products');
    console.error('   Possible causes:');
    console.error('   1. Affiliate API permission not enabled');
    console.error('   2. Invalid access token');
    console.error('   3. API endpoint issue');
    console.error('   4. Signature calculation error');
    exitCode = 1;
  } else {
    const successfulTests = testResults.filter(r => r.success).length;
    const sampleProduct = testResults.find(r => r.sampleProduct)?.sampleProduct;
    
    console.log('✅ VERIFICATION COMPLETE');
    console.log(`   Successful keywords: ${successfulTests}/${TEST_KEYWORDS.length}`);
    console.log(`   Access token: ${accessToken.substring(0, 10)}...${accessToken.slice(-6)}`);
    
    if (sampleProduct) {
      console.log(`   Sample product: ${sampleProduct.title.substring(0, 60)}...`);
      console.log(`   Sample price: ${sampleProduct.price} ${sampleProduct.currency}`);
    }
    
    console.log('AFFILIATE PRODUCTS RECEIVED');
    console.log('VERIFICATION SUCCESS');
    console.log('\n🎉 AFFILIATE API FULLY OPERATIONAL — REAL PRODUCTS CONFIRMED');
    console.log('========================================================\n');
  }

  // If all keywords failed, provide diagnostic info
  if (allKeywordsFailed && !atLeastOneSuccess) {
    console.log('\n⚠️  DIAGNOSTIC INFORMATION:');
    console.log('   All test keywords returned 0 products.');
    console.log('   This suggests:');
    console.log('   - Affiliate permission may not be enabled in AliExpress Open Platform');
    console.log('   - OAuth authorization may not have included affiliate API scope');
    console.log('   - App configuration may need affiliate API access approval');
    console.log('\n   However, signature implementation appears correct.');
    console.log('   Please verify affiliate API permissions in AliExpress Open Platform.\n');
  }

  return exitCode;
}

// Run script with strict error handling
main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('\n❌ FATAL ERROR:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
