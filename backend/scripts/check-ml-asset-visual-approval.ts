#!/usr/bin/env tsx
import 'dotenv/config';

import { runMercadoLibreAssetVisualApproval } from '../src/services/mercadolibre-asset-approval.service';

async function main(): Promise<void> {
  const productId = Number(process.argv[2] || 32690);
  const applyTransition = process.argv.includes('--apply');
  const result = await runMercadoLibreAssetVisualApproval({
    productId,
    applyTransition,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.packApproved ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
