/**
 * Script: verify-publish-readiness.ts
 * Verifies product 32722 + WorkflowConfig are ready for republish
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('=== PRODUCT 32722 AFTER FIX ===');
    const product = await prisma.product.findFirst({ where: { id: 32722 } });
    if (!product) { console.log('NOT FOUND'); return; }

    const p = product as any;
    const priceOk = parseFloat(p.suggestedPrice) > parseFloat(p.totalCost);
    const currencyOk = p.currency === 'USD';
    const aliUrlOk = !!p.aliexpressUrl && p.aliexpressUrl.includes('aliexpress.com/item/');
    const statusOk = p.status === 'VALIDATED_READY';

    console.log(`  [${currencyOk ? '✅' : '❌'}] currency: ${p.currency}`);
    console.log(`  [${priceOk ? '✅' : '❌'}] suggestedPrice ($${p.suggestedPrice}) > totalCost ($${p.totalCost})`);
    console.log(`  [${aliUrlOk ? '✅' : '❌'}] aliexpressUrl: ${p.aliexpressUrl || '[none]'}`);
    console.log(`  [${statusOk ? '✅' : '❌'}] status: ${p.status}`);

    console.log('\n=== WORKFLOW CONFIG ===');
    const wfRows = await prisma.$queryRaw<any[]>`
      SELECT "workflowMode", "stageFulfillment", "stagePurchase", "environment",
             "mlHandlingTimeDays", "userId"
      FROM user_workflow_configs
      WHERE "userId" = 1
      LIMIT 1
    `;
    if (!wfRows.length) {
      console.log('  WorkflowConfig not found');
    } else {
      const wf = wfRows[0];
      const modeOk = wf.workflowMode === 'hybrid';
      const stageOk = wf.stageFulfillment === 'manual';
      const envOk = wf.environment === 'production';
      console.log(`  [${modeOk ? '✅' : '⚠️'}] workflowMode: ${wf.workflowMode} (recommended: hybrid)`);
      console.log(`  [${stageOk ? '✅' : '❌'}] stageFulfillment: ${wf.stageFulfillment} (must be: manual for first order)`);
      console.log(`  [${wf.stagePurchase === 'manual' ? '✅' : '⚠️'}] stagePurchase: ${wf.stagePurchase}`);
      console.log(`  [${envOk ? '✅' : '⚠️'}] environment: ${wf.environment}`);
      console.log(`  [ℹ️ ] mlHandlingTimeDays: ${wf.mlHandlingTimeDays}`);
    }

    console.log('\n=== LISTINGS FOR PRODUCT 32722 ===');
    const listings = await prisma.marketplaceListing.findMany({
      where: { productId: 32722 },
      orderBy: { publishedAt: 'desc' },
      take: 3,
    });
    for (const l of listings) {
      const ll = l as any;
      console.log(`  [${ll.listingId}] status=${ll.status} legalTextsAppended=${ll.legalTextsAppended} publishedAt=${ll.publishedAt}`);
    }

    console.log('\n=== SUMMARY ===');
    const allOk = currencyOk && priceOk && aliUrlOk && statusOk;
    if (allOk) {
      console.log('✅ Product ready for republish with legal footer');
    } else {
      console.log('❌ Fix remaining issues before republishing');
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
