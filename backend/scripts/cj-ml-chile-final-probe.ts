import 'dotenv/config';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierHttpClient } from '../src/modules/cj-ebay/adapters/cj-supplier.client';
import fs from 'fs';
import path from 'path';

// Enable diagnostic logs
process.env.CJ_DIAGNOSTIC_LOGS = '1';

const SMOKE_USER_ID = 1;

async function runFinalProbe() {
  const adapter = createCjSupplierAdapter(SMOKE_USER_ID);
  const adapterInternal = adapter as any;

  const report: any = {
    timestamp: new Date().toISOString(),
    probes: []
  };

  console.log(`Starting CJ -> ML Chile Final Discovery Probe...`);

  // 1. Test "logistic/getWarehouseByEndCountry"
  console.log(`[PROBE] logistic/getWarehouseByEndCountry?endCountryCode=CL...`);
  try {
    const data = await adapterInternal.authedGet('logistic/getWarehouseByEndCountry?endCountryCode=CL');
    console.log(`  - SUCCESS! Found warehouse data for endCountry=CL`);
    report.probes.push({ endpoint: 'logistic/getWarehouseByEndCountry', success: true, data });
  } catch (e: any) {
    console.log(`  - FAILED: logistic/getWarehouseByEndCountry (${e.message})`);
    report.probes.push({ endpoint: 'logistic/getWarehouseByEndCountry', success: false, error: e.message });
  }

  // 2. Search for "Chile" as a keyword to find products that are explicitly for Chile
  console.log(`\n[PROBE] Searching for keyword "Chile" in listV2...`);
  try {
    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('size', '50');
    params.set('keyWord', 'Chile');
    
    const data = await adapterInternal.authedGet(`product/listV2?${params.toString()}`);
    let rows: any[] = [];
    if (data && data.content && Array.isArray(data.content)) {
        for (const item of data.content) {
            if (item.productList && Array.isArray(item.productList)) {
                rows.push(...item.productList);
            }
        }
    }
    console.log(`  - Found ${rows.length} products matching "Chile".`);
    
    const clHits: any[] = [];
    for (const row of rows) {
        if (JSON.stringify(row).includes('"CL"')) {
            console.log(`    !!! FOUND CL METADATA in PID: ${row.pid}`);
            clHits.push(row);
        }
    }
    report.nameSearch = { keyword: 'Chile', hits: clHits.length, samples: clHits.slice(0, 5) };
  } catch (e: any) {
    console.error(`  [ERROR] Name search failed:`, e.message);
  }

  const outPath = path.join(__dirname, '..', 'cj-ml-chile-final-probe-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFinal Probe complete. Results saved to ${outPath}`);
}

runFinalProbe();
