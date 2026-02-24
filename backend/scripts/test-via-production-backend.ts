#!/usr/bin/env tsx
/**
 * Test AliExpress API via Production Backend
 * Uses the running backend at Railway to test
 */

import axios from 'axios';

const BACKEND_URL = 'https://ivan-reseller-backend-production.up.railway.app';

async function main() {
  console.log('========================================================');
  console.log('TESTING ALIEXPRESS VIA PRODUCTION BACKEND');
  console.log('========================================================\n');

  // Step 1: Check OAuth status
  console.log('?? STEP 1: Checking OAuth token status...');
  try {
    const statusResponse = await axios.get(`${BACKEND_URL}/api/aliexpress/oauth/status`, {
      timeout: 10000,
    });
    
    console.log('Response:', JSON.stringify(statusResponse.data, null, 2));
    
    if (statusResponse.data?.hasToken && !statusResponse.data?.expired) {
      console.log('? Valid token found!\n');
      
      // Step 2: Test Affiliate API
      console.log('?? STEP 2: Testing Affiliate API...');
      try {
        const testResponse = await axios.get(`${BACKEND_URL}/api/aliexpress/affiliate/debug-search`, {
          timeout: 30000,
        });
        
        console.log('Response:', JSON.stringify(testResponse.data, null, 2));
        
        if (testResponse.data?.success && testResponse.data?.productsLength > 0) {
          console.log('\n========================================================');
          console.log('? SUCCESS!');
          console.log('========================================================');
          console.log(`Products returned: ${testResponse.data.productsLength}`);
          if (testResponse.data.products?.[0]) {
            console.log(`Sample product: ${testResponse.data.products[0].productTitle?.substring(0, 60)}...`);
            console.log(`Price: ${testResponse.data.products[0].salePrice} ${testResponse.data.products[0].currency || 'USD'}`);
          }
          console.log('\n?? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED');
          console.log('========================================================\n');
          process.exit(0);
        } else {
          console.log('\n??  No products returned');
          console.log('   This may indicate affiliate permission not enabled');
          process.exit(1);
        }
      } catch (error: any) {
        console.error(`? Affiliate API test failed: ${error.message}`);
        if (error.response?.data) {
          console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
      }
    } else {
      console.log('? No valid token found');
      console.log('   Status:', statusResponse.data);
      
      // Try to get authorization URL
      console.log('\n?? Attempting to get authorization URL...');
      try {
        const urlResponse = await axios.get(`${BACKEND_URL}/api/aliexpress/oauth/url`, {
          timeout: 10000,
        });
        console.log('Authorization URL:', urlResponse.data?.url || urlResponse.data);
        console.log('\n??  You need to authorize the app first');
        console.log('   Open the URL above, authorize, and get the code from callback');
      } catch (urlError: any) {
        console.error(`? Error getting URL: ${urlError.message}`);
      }
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`? Error checking status: ${error.message}`);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
