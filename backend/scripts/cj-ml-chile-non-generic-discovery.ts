import 'dotenv/config';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import { CjSupplierHttpClient } from '../src/modules/cj-ebay/adapters/cj-supplier.client';
import fs from 'fs';
import path from 'path';

const SMOKE_USER_ID = 1;
const DEST_ZIP = '7500000';
const DEST_COUNTRY = 'CL';

interface DiscoveryReport {
  timestamp: string;
  warehouseAudit: any;
  countryCodeSearch: any;
  categorySampling: any;
  blindFreightProbing: any;
}

async function runDiscovery() {
  const adapter = createCjSupplierAdapter(SMOKE_USER_ID);
  const client = new CjSupplierHttpClient();
  
  // We need the token from the adapter (it's private, but we can call authedGet)
  // Actually, let's just use the adapter's authedGet for these new endpoints.
  // Wait, CjSupplierAdapter.authedGet is private. 
  // I will use some TypeScript casting to access it for this research script.
  const adapterInternal = adapter as any;

  const report: DiscoveryReport = {
    timestamp: new Date().toISOString(),
    warehouseAudit: null,
    countryCodeSearch: null,
    categorySampling: null,
    blindFreightProbing: null
  };

  console.log(`Starting CJ -> ML Chile Non-Generic Discovery...`);

  // 1. Warehouse Detail Audit
  console.log(`[TASK 1] warehouse/detail audit...`);
  try {
    const warehouses = await adapterInternal.authedGet('warehouse/detail');
    report.warehouseAudit = {
      raw: warehouses,
      chileMatches: Array.isArray(warehouses) ? warehouses.filter((w: any) => 
        JSON.stringify(w).toLowerCase().includes('chile') || 
        JSON.stringify(w).toLowerCase().includes('cl')
      ) : []
    };
    console.log(`  - Found ${Array.isArray(warehouses) ? warehouses.length : 0} warehouses.`);
    if (report.warehouseAudit.chileMatches.length > 0) {
      console.log(`  - !!! FOUND POSSIBLE CHILE WAREHOUSES:`, report.warehouseAudit.chileMatches);
    } else {
      console.log(`  - No explicit "Chile" or "CL" warehouse found in metadata.`);
    }
  } catch (e) {
    console.error(`  [ERROR] warehouse/detail failed:`, e);
    report.warehouseAudit = { error: String(e) };
  }

  // 2. product/listV2 with explicit countryCode=CL
  console.log(`\n[TASK 2] product/listV2 with countryCode=CL...`);
  try {
    // Testing with a broad search or empty search if allowed
    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('size', '20');
    params.set('countryCode', DEST_COUNTRY); 
    
    // We try multiple seeds
    const seeds = ['', 'phone', 'home', 'kitchen'];
    const searchHits: any[] = [];
    
    for (const seed of seeds) {
      if (seed) params.set('keyWord', seed);
      else params.delete('keyWord');
      
      console.log(`  - Searching with seed: "${seed}" and countryCode=CL...`);
      const data = await adapterInternal.authedGet(`product/listV2?${params.toString()}`);
      
      // Standard listV2 parsing logic from adapter
      let rows: any[] = [];
      if (data && data.content && Array.isArray(data.content)) {
          for (const item of data.content) {
              if (item.productList && Array.isArray(item.productList)) {
                  rows.push(...item.productList);
              }
          }
      }

      console.log(`    -> Found ${rows.length} product rows.`);
      searchHits.push({ seed, count: rows.length, samples: rows.slice(0, 3).map(r => ({ pid: r.pid, name: r.productNameEn || r.productName })) });
    }
    report.countryCodeSearch = searchHits;
  } catch (e) {
    console.error(`  [ERROR] product/listV2 test failed:`, e);
  }

  // 3. product/getCategory + category-ID sampling
  console.log(`\n[TASK 3] product/getCategory exploration...`);
  try {
    const categories = await adapterInternal.authedGet('product/getCategory');
    const catList = Array.isArray(categories) ? categories : [];
    console.log(`  - Found ${catList.length} top-level categories.`);
    
    const samples: any[] = [];
    // Sample top 5 categories
    for (const cat of catList.slice(0, 5)) {
      const cid = cat.cid;
      console.log(`  - Sampling category ${cat.categoryName} (CID: ${cid}) for CL stock...`);
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('size', '10');
      params.set('categoryId', cid);
      params.set('countryCode', DEST_COUNTRY);
      
      const data = await adapterInternal.authedGet(`product/listV2?${params.toString()}`);
      // Parse rows
      let rows: any[] = [];
      if (data && data.content && Array.isArray(data.content)) {
          for (const item of data.content) {
              if (item.productList && Array.isArray(item.productList)) {
                  rows.push(...item.productList);
              }
          }
      }
      
      samples.push({
        categoryId: cid,
        categoryName: cat.categoryName,
        count: rows.length,
        hasCLInventory: rows.some(r => JSON.stringify(r).includes('"CL"'))
      });
      console.log(`    -> Found ${rows.length} products in category.`);
    }
    report.categorySampling = {
      totalCategories: catList.length,
      samples
    };
  } catch (e) {
    console.error(`  [ERROR] product/getCategory failed:`, e);
  }

  // 4. Blind CL -> CL freight probing on globally common products
  console.log(`\n[TASK 4] Blind CL -> CL freight probing...`);
  try {
      // Find 5 random globally popular items (just using a keyword search)
      const popular = await adapter.searchProducts({ keyword: 'led strip', pageSize: 5 });
      const probes: any[] = [];
      
      for (const item of popular) {
          console.log(`  - Blind probing freight for: ${item.title.substring(0, 30)}...`);
          const detail = await adapter.getProductById(item.cjProductId);
          const vid = detail.variants[0]?.cjVid;
          if (!vid) continue;
          
          try {
              const { quote } = await adapter.quoteShippingToUsReal({
                  productId: item.cjProductId,
                  variantId: vid,
                  quantity: 1,
                  destPostalCode: DEST_ZIP,
                  destCountryCode: DEST_COUNTRY,
                  startCountryCode: 'CL'
              });
              
              if (quote.startCountryCode === 'CL') {
                  console.log(`    -> [BINGO] Found hidden Chile stock via blind probe!`);
                  probes.push({ pid: item.cjProductId, title: item.title, success: true, cost: quote.cost });
              } else {
                  probes.push({ pid: item.cjProductId, title: item.title, success: false, reason: 'Returned origins: ' + quote.startCountryCode });
              }
          } catch (e) {
              probes.push({ pid: item.cjProductId, title: item.title, success: false, error: String(e) });
          }
      }
      report.blindFreightProbing = probes;
  } catch (e) {
      console.error(`  [ERROR] Blind probing failed:`, e);
  }

  const outPath = path.join(__dirname, '..', 'cj-ml-chile-non-generic-discovery-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nDiscovery complete. Results saved to ${outPath}`);
}

runDiscovery();
