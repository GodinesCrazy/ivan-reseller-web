import 'dotenv/config';
import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';
import fs from 'fs';
import path from 'path';

const SMOKE_USER_ID = 1; // Assuming user 1 has the API key
const DEST_ZIP = '7500000';
const DEST_COUNTRY = 'CL';
const SEARCH_PAGE_SIZE = 10;

const KEYWORD_FAMILIES = [
  'phone accessories',
  'household storage',
  'beauty tools',
  'hair accessories',
  'organizers',
  'decor',
  'stationery',
  'automotive accessories',
  'fitness accessories',
  'pet accessories',
  'kitchen tools',
  'baby items',
  'jewelry',
  'fashion accessories'
];

interface AuditResult {
  keyword: string;
  rawSearchCount: number;
  candidatesWithCLRow: number;
  verifiedWarehouseCount: number;
  positiveLocalStockCount: number;
  successfulFreightCount: number;
  readyCandidates: number;
  samples: any[];
}

async function runAudit() {
  const adapter = createCjSupplierAdapter(SMOKE_USER_ID);
  const results: AuditResult[] = [];

  console.log(`Starting CJ -> ML Chile Discovery Audit...`);
  console.log(`Target Destination: ${DEST_COUNTRY} (ZIP: ${DEST_ZIP})\n`);

  for (const keyword of KEYWORD_FAMILIES) {
    console.log(`[AUDIT] Scanning family: "${keyword}"...`);
    const audit: AuditResult = {
      keyword,
      rawSearchCount: 0,
      candidatesWithCLRow: 0,
      verifiedWarehouseCount: 0,
      positiveLocalStockCount: 0,
      successfulFreightCount: 0,
      readyCandidates: 0,
      samples: []
    };

    try {
      const searchItems = await adapter.searchProducts({
        keyword,
        page: 1,
        pageSize: SEARCH_PAGE_SIZE
      });

      audit.rawSearchCount = searchItems.length;

      for (const item of searchItems) {
        const pid = item.cjProductId;
        let hasCLRow = false;
        let isVerified = false;

        // 1. Check if summary has CL row
        if (item.destinationInventories) {
          const clInv = item.destinationInventories.find(inv => inv.countryCode === 'CL');
          if (clInv) {
            hasCLRow = true;
            audit.candidatesWithCLRow++;
            if (clInv.verifiedWarehouse) {
              isVerified = true;
              audit.verifiedWarehouseCount++;
            }
          }
        }

        // 2. Fetch Deep Detail
        console.log(`  - Deep checking product: ${pid} (${item.title.substring(0, 30)}...)`);
        const detail = await adapter.getProductById(pid);
        const vids = detail.variants.map(v => v.cjVid).filter((v): v is string => !!v);

        if (vids.length === 0) continue;

        // 3. Check Live Stock
        const stockMap = await adapter.getStockForSkus(vids);
        let positiveStock = false;
        let bestVid: string | undefined;
        let maxStock = 0;

        for (const [vid, stock] of stockMap.entries()) {
          if (stock > 0) {
            positiveStock = true;
            if (stock > maxStock) {
              maxStock = stock;
              bestVid = vid;
            }
          }
        }

        if (positiveStock) {
          // We count this if it either has a CL row or if we want to probe anyway
          // Given the strict scope, we prioritize those with CL row hints or we probe the best candidate
          if (hasCLRow) {
             audit.positiveLocalStockCount++;
          }
        }

        // 4. Freight Probe (Only if it has local potential)
        if (bestVid && (hasCLRow || audit.readyCandidates < 3)) { // Probe anyway for science if we lack candidates
          try {
            const { quote } = await adapter.quoteShippingToUsReal({
              productId: pid,
              variantId: bestVid,
              quantity: 1,
              destPostalCode: DEST_ZIP,
              destCountryCode: DEST_COUNTRY,
              startCountryCode: 'CL' // Try local first
            });

            if (quote.startCountryCode === 'CL') {
              audit.successfulFreightCount++;
              audit.readyCandidates++;
              
              audit.samples.push({
                productId: pid,
                title: item.title,
                variantId: bestVid,
                stock: maxStock,
                hasCLRow,
                isVerified,
                cost: quote.cost,
                method: quote.method,
                eta: quote.estimatedDays
              });
              
              console.log(`    [WIN] Found Chile-local candidate! PID: ${pid}, Stock: ${maxStock}`);
            }
          } catch (e) {
            // Freight failed for local, try to see if it's because it's only CN
            // No action needed for audit stats
          }
        }
      }
    } catch (error) {
      console.error(`  [ERROR] Failed to scan "${keyword}":`, error);
    }

    results.push(audit);
    console.log(`[DONE] ${keyword}: ${audit.readyCandidates} ready candidates found.\n`);
  }

  const outPath = path.join(__dirname, '..', 'cj-ml-chile-discovery-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Audit complete. Results saved to ${outPath}`);
}

runAudit();
