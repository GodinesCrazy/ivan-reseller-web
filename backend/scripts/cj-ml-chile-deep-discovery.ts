import 'dotenv/config';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierHttpClient } from '../src/modules/cj-ebay/adapters/cj-supplier.client';
import fs from 'fs';
import path from 'path';

// Enable diagnostic logs for this run
process.env.CJ_DIAGNOSTIC_LOGS = '1';

const SMOKE_USER_ID = 1;

async function runDiscovery() {
  const adapter = createCjSupplierAdapter(SMOKE_USER_ID);
  const adapterInternal = adapter as any;

  const report: any = {
    timestamp: new Date().toISOString(),
    apiAttempts: []
  };

  console.log(`Starting CJ -> ML Chile Deep Discovery (Diagnostic Mode)...`);

  // 1. Try different warehouse endpoints
  const whEndpoints = [
    'warehouse/detail',
    'logistic/getWarehouseList',
    'setting/getWarehouse'
  ];

  for (const endpoint of whEndpoints) {
    console.log(`[RETRY] Testing warehouse endpoint: ${endpoint}...`);
    try {
      const data = await adapterInternal.authedGet(endpoint);
      console.log(`  - SUCCESS: ${endpoint}`);
      report.apiAttempts.push({ endpoint, success: true, count: Array.isArray(data) ? data.length : 1, sample: data });
    } catch (e: any) {
      console.log(`  - FAILED: ${endpoint} (${e.message})`);
      report.apiAttempts.push({ endpoint, success: false, error: e.message });
    }
  }

  // 2. Broad Search Audit (Scan 100 products for ANY CL rows)
  console.log(`\n[TASK] Broad Search Audit (Page 1 + Page 2)...`);
  const allClCandidates: any[] = [];
  try {
    for (let p = 1; p <= 5; p++) {
      console.log(`  - Scanning page ${p} of listV2...`);
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('size', '20');
      
      const data = await adapterInternal.authedGet(`product/listV2?${params.toString()}`);
      
      let rows: any[] = [];
      if (data && data.content && Array.isArray(data.content)) {
          for (const item of data.content) {
              if (item.productList && Array.isArray(item.productList)) {
                  rows.push(...item.productList);
              }
          }
      }

      for (const row of rows) {
        // Look for CL in the raw row JSON
        if (JSON.stringify(row).includes('"CL"')) {
          console.log(`    !!! FOUND CL METADATA in PID: ${row.pid} (${row.productNameEn || row.productName})`);
          allClCandidates.push(row);
        }
      }
    }
  } catch (e: any) {
    console.error(`  [ERROR] Broad search failed:`, e.message);
  }

  report.broadSearchAudit = {
    totalScanned: 100,
    clHits: allClCandidates.length,
    hits: allClCandidates.map(c => ({ pid: c.pid, name: c.productNameEn || c.productName }))
  };

  const outPath = path.join(__dirname, '..', 'cj-ml-chile-deep-discovery-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nDeep Discovery complete. Results saved to ${outPath}`);
}

runDiscovery();
