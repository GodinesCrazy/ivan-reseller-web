/**
 * Retry payout for a sale in PAYOUT_FAILED or PAYOUT_SKIPPED_INSUFFICIENT_FUNDS.
 * Usage: npm run retry:payout <saleId>
 */

import { saleService } from '../src/services/sale.service';

async function main() {
  const saleId = parseInt(process.argv[2] || '0', 10);
  if (!saleId || isNaN(saleId)) {
    console.error('Usage: npm run retry:payout <saleId>');
    process.exit(1);
  }
  const result = await saleService.retryPayout(saleId);
  if (result.success) {
    console.log('OK: Payout ejecutado correctamente para sale', saleId);
    process.exit(0);
  }
  console.error('Error:', result.message);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
