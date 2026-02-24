#!/usr/bin/env tsx
/**
 * Check AliExpress token status and test API
 * Attempts to use existing token or provides instructions
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { getOAuthStatus } from '../src/services/aliexpress-oauth.service';
import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { getToken } from '../src/services/aliexpress-token.store';
import { prisma } from '../src/config/database';

async function main() {
  console.log('========================================================');
  console.log('ALIEXPRESS TOKEN CHECK & TEST');
  console.log('========================================================\n');

  // Check in-memory token store
  console.log('?? STEP 1: Checking in-memory token store...');
  const memoryToken = getToken();
  if (memoryToken?.accessToken) {
    console.log('? Token found in memory store');
    console.log(`   Access token (masked): ${memoryToken.accessToken.substring(0, 10)}...${memoryToken.accessToken.slice(-6)}`);
    console.log(`   Expires at: ${new Date(memoryToken.expiresAt).toISOString()}`);
    
    const status = getOAuthStatus();
    if (!status.expired) {
      console.log('? Token is valid and not expired\n');
      
      // Try to test the API
      console.log('?? STEP 2: Testing Affiliate API...');
      try {
        await aliexpressAffiliateAPIService.loadTokenFromDatabase();
        aliexpressAffiliateAPIService.setAccessToken(memoryToken.accessToken);
        
        const products = await aliexpressAffiliateAPIService.searchProducts({
          keywords: 'phone case',
          pageNo: 1,
          pageSize: 5,
          shipToCountry: 'US',
        });
        
        console.log(`? API Test SUCCESS: ${products.length} products returned`);
        if (products.length > 0) {
          console.log(`   Sample: ${products[0].productTitle.substring(0, 60)}...`);
          console.log(`   Price: ${products[0].salePrice} ${products[0].currency || 'USD'}`);
        }
        console.log('\n?? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED');
        process.exit(0);
      } catch (error: any) {
        console.error(`? API Test FAILED: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.log('? Token has expired\n');
    }
  } else {
    console.log('? No token found in memory store\n');
  }

  // Check database
  console.log('?? STEP 2: Checking database...');
  try {
    const dbToken = await prisma.aliExpressToken.findUnique({
      where: { id: 'global' },
    });

    if (dbToken && dbToken.accessToken) {
      console.log('? Token found in database');
      console.log(`   Access token (masked): ${dbToken.accessToken.substring(0, 10)}...${dbToken.accessToken.slice(-6)}`);
      console.log(`   Expires at: ${dbToken.expiresAt.toISOString()}`);
      
      const isExpired = dbToken.expiresAt < new Date();
      if (!isExpired) {
        console.log('? Token is valid and not expired\n');
        
        // Try to test the API
        console.log('?? STEP 3: Testing Affiliate API with database token...');
        try {
          await aliexpressAffiliateAPIService.loadTokenFromDatabase();
          aliexpressAffiliateAPIService.setAccessToken(dbToken.accessToken);
          
          const products = await aliexpressAffiliateAPIService.searchProducts({
            keywords: 'phone case',
            pageNo: 1,
            pageSize: 5,
            shipToCountry: 'US',
          });
          
          console.log(`? API Test SUCCESS: ${products.length} products returned`);
          if (products.length > 0) {
            console.log(`   Sample: ${products[0].productTitle.substring(0, 60)}...`);
            console.log(`   Price: ${products[0].salePrice} ${products[0].currency || 'USD'}`);
          }
          console.log('\n?? AFFILIATE API FULLY OPERATIONAL ? REAL PRODUCTS CONFIRMED');
          process.exit(0);
        } catch (error: any) {
          console.error(`? API Test FAILED: ${error.message}`);
          process.exit(1);
        }
      } else {
        console.log('? Token in database has expired\n');
      }
    } else {
      console.log('? No token found in database\n');
    }
  } catch (error: any) {
    console.error(`? Error checking database: ${error.message}\n`);
  }

  // No token found
  console.log('========================================================');
  console.log('NO TOKEN FOUND');
  console.log('========================================================\n');
  console.log('To get a token, you need to:');
  console.log('1. Get authorization URL: Visit /api/aliexpress/oauth/url');
  console.log('2. Authorize the app in AliExpress');
  console.log('3. Get the code from callback URL');
  console.log('4. Run: npx tsx scripts/test-aliexpress-full-flow.ts YOUR_CODE\n');
  
  process.exit(1);
}

main().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
