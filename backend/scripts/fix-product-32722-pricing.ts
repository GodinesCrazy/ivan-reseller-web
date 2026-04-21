/**
 * Script: fix-product-32722-pricing.ts
 *
 * Fixes product 32722 "Soporte Escritorio Gatito" which has:
 *   - currency: CLP  (should be USD like all other products)
 *   - suggestedPrice: 6.01  (should be ~9.99 USD)
 *
 * Root cause: currency=CLP causes publish flow to skip FX conversion
 * and send 6.01 CLP directly to ML Chile (< $0.01 USD — effectively free).
 *
 * Fix:
 *   currency       → USD
 *   suggestedPrice → 9.99 USD  (~9990 CLP at 1000 CLP/USD)
 *   totalCost      → 4.39 USD  (aliexpressPrice 1.70 + shippingCost 1.99 + importTax 0.70)
 *   shippingCost   → 1.99 USD  (already correct scale, just confirming)
 *   importTax      → 0.70 USD  (already correct scale, just confirming)
 *   aliexpressPrice → 1.70 USD (already correct scale, just confirming)
 *   status         → VALIDATED_READY (unchanged)
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const prisma = new PrismaClient();

  try {
    const product = await prisma.product.findFirst({ where: { id: 32722 } });
    if (!product) { console.error('Product 32722 not found'); return; }

    console.log('=== CURRENT STATE ===');
    console.log(`  currency: ${product.currency}`);
    console.log(`  suggestedPrice: ${product.suggestedPrice}`);
    console.log(`  totalCost: ${product.totalCost}`);
    console.log(`  shippingCost: ${product.shippingCost}`);
    console.log(`  importTax: ${product.importTax}`);
    console.log(`  aliexpressPrice: ${(product as any).aliexpressPrice}`);

    const newValues = {
      currency: 'USD',
      suggestedPrice: 9.99,
      totalCost: 4.39,
      shippingCost: 1.99,
      importTax: 0.70,
    };

    console.log('\n=== NEW VALUES ===');
    for (const [k, v] of Object.entries(newValues)) {
      console.log(`  ${k}: ${(product as any)[k]} → ${v}`);
    }

    if (DRY_RUN) {
      console.log('\n[DRY RUN] No changes made. Remove --dry-run to apply.');
      return;
    }

    await prisma.product.update({
      where: { id: 32722 },
      data: newValues,
    });

    console.log('\n✅ Product 32722 updated successfully.');
    console.log('   suggestedPrice = $9.99 USD → ~9990 CLP (at ~1000 CLP/USD)');
    console.log('   ML publish will now convert USD → CLP via FX service');
    console.log('   Profitability: $9.99 sale - $4.39 cost = $5.60 gross margin (56%)');
    console.log('   After ML ~17% commission (~$1.70): ~$3.90 net margin (39%)');

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
