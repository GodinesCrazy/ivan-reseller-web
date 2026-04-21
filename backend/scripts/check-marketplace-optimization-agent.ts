#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { analyzeMarketplaceOptimizationCandidate } from '../src/services/marketplace-optimization-agent.service';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const productId = Number(process.argv[2] || 32690);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      category: true,
      images: true,
      productData: true,
      finalPrice: true,
      suggestedPrice: true,
      targetCountry: true,
      shippingCost: true,
      totalCost: true,
      isPublished: true,
      status: true,
    },
  });

  if (!product) {
    throw new Error(`product_${productId}_not_found`);
  }

  const analysis = analyzeMarketplaceOptimizationCandidate(product);

  console.log(
    JSON.stringify(
      {
        productId: product.id,
        title: product.title,
        status: product.status,
        isPublished: product.isPublished,
        optimization: analysis,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
