import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
const backendRoot = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(backendRoot, '.env'))) dotenv.config({ path: path.join(backendRoot, '.env') });
if (fs.existsSync(path.join(backendRoot, '.env.local'))) dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });

import { prisma } from '../src/config/database';

async function main() {
  const prod = await prisma.product.findUnique({
    where: { id: 32722 },
    select: { id: true, status: true, isPublished: true, title: true, images: true, productData: true }
  });
  
  const images: any[] = typeof prod?.images === 'string' ? JSON.parse(prod?.images as any) : (prod?.images as any) ?? [];
  const productData: any = typeof prod?.productData === 'string' ? JSON.parse(prod?.productData as any) : (prod?.productData as any) ?? {};
  
  console.log('[Product]', JSON.stringify({ id: prod?.id, status: prod?.status, isPublished: prod?.isPublished, title: prod?.title }));
  console.log('\n[Images count]', images.length);
  console.log('[Images]', JSON.stringify(images, null, 2));
  console.log('\n[ProductData keys]', Object.keys(productData));
}

main().catch(e => { console.error(e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
