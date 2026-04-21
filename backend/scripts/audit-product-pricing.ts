/**
 * Script: audit-product-pricing.ts
 * Audits product 32722 pricing fields to understand the currency/price inconsistency
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    // Get product 32722 with all fields
    const product = await prisma.product.findFirst({
      where: { id: 32722 },
    });

    if (!product) {
      console.log('Product 32722 not found');
      return;
    }

    console.log('=== PRODUCT 32722 FULL PRICING AUDIT ===');
    console.log(JSON.stringify({
      id: product.id,
      name: (product as any).name,
      title: (product as any).title,
      status: product.status,
      currency: product.currency,
      suggestedPrice: product.suggestedPrice,
      cost: (product as any).cost,
      totalCost: product.totalCost,
      shippingCost: product.shippingCost,
      importTax: product.importTax,
      profitMargin: product.profitMargin,
      aliexpressPrice: (product as any).aliexpressPrice,
      basePrice: (product as any).basePrice,
      marketPrice: (product as any).marketPrice,
      targetPrice: (product as any).targetPrice,
      minPrice: (product as any).minPrice,
      maxPrice: (product as any).maxPrice,
      priceInUsd: (product as any).priceInUsd,
      aliexpressUrl: product.aliexpressUrl,
    }, null, 2));

    // Compare with other products to see the pricing pattern
    console.log('\n=== OTHER PRODUCTS PRICING SAMPLE ===');
    const others = await prisma.product.findMany({
      where: {
        status: { in: ['VALIDATED_READY', 'ACTIVE'] },
        id: { not: 32722 }
      },
      take: 5,
      orderBy: { id: 'desc' }
    });

    for (const p of others) {
      console.log(`id=${p.id} currency=${p.currency} suggestedPrice=${p.suggestedPrice} totalCost=${p.totalCost} status=${p.status}`);
    }

    // Check the WorkflowConfig to understand the operating currency
    const wfConfig = await (prisma as any).workflowConfig.findFirst({
      where: { userId: 1 }
    });
    if (wfConfig) {
      console.log('\n=== WORKFLOW CONFIG RELEVANT FIELDS ===');
      console.log(JSON.stringify({
        currency: wfConfig.currency,
        targetCurrency: wfConfig.targetCurrency,
        defaultCurrency: wfConfig.defaultCurrency,
        mlHandlingTimeDays: wfConfig.mlHandlingTimeDays,
        workflowMode: wfConfig.workflowMode,
        stageFulfillment: wfConfig.stageFulfillment,
        stagePurchase: wfConfig.stagePurchase,
        environment: wfConfig.environment,
      }, null, 2));
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
