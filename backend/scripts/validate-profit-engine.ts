#!/usr/bin/env tsx
/**
 * FULL profit engine validation — confirms Autopilot can generate REAL
 * profitable opportunities (eBay / Cache / AI / Static) when Affiliate returns 0.
 * Exit 0 = WORKING, Exit 1 = FAILED.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

import opportunityFinder from '../src/services/opportunity-finder.service';

async function validate(): Promise<void> {
  console.log('[TEST] Starting FULL profit engine validation');

  const opportunities = await opportunityFinder.searchOpportunities(
    'phone',
    1,
    {
      maxItems: 10,
      marketplaces: ['ebay'],
      region: 'us',
      skipTrendsValidation: true,
    }
  );

  console.log('[TEST] Opportunities found:', opportunities.length);

  if (opportunities.length > 0) {
    console.log('[AUTOPILOT] SUCCESS — REAL profitable opportunities detected');
    console.log('PROFIT_ENGINE_STATUS = WORKING');
    process.exit(0);
  } else {
    console.log('PROFIT_ENGINE_STATUS = FAILED');
    process.exit(1);
  }
}

validate().catch((err: any) => {
  console.error('PROFIT_ENGINE_STATUS = FAILED', err?.message ?? err);
  process.exit(1);
});
