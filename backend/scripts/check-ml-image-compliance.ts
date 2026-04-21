#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { auditMercadoLibreChileImagePolicy } from '../src/services/mercadolibre-image-policy.service';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const productId = Number(process.argv[2] || 32690);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      images: true,
      productData: true,
      status: true,
      isPublished: true,
    },
  });

  if (!product) {
    throw new Error(`product_${productId}_not_found`);
  }

  const audit = await auditMercadoLibreChileImagePolicy({
    productId: product.id,
    images: product.images,
    productData: product.productData,
  });

  console.log(
    JSON.stringify(
      {
        productId: product.id,
        title: product.title,
        status: product.status,
        isPublished: product.isPublished,
        audit,
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
