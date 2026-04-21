#!/usr/bin/env tsx
/** P104 — one-off DB snapshot for product 32714 (persistence check). */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { getCanonicalMercadoLibreAssetPackDir } from '../src/services/mercadolibre-image-remediation.service';

const OUT = path.join(process.cwd(), '..', 'p104-persistence-32714.json');

async function main(): Promise<void> {
  const productId = 32714;
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      userId: true,
      status: true,
      isPublished: true,
      publishedAt: true,
      images: true,
      title: true,
    },
  });
  const listings = await prisma.marketplaceListing.findMany({
    where: { productId },
    orderBy: { id: 'desc' },
    take: 8,
  });
  const packDir = getCanonicalMercadoLibreAssetPackDir(productId);
  const manifestPath = path.join(packDir, 'ml-asset-pack.json');
  let manifest: unknown = null;
  try {
    manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  } catch {
    manifest = { error: 'manifest_unreadable_or_missing', manifestPath };
  }
  const snap = {
    executedAt: new Date().toISOString(),
    productId,
    product: p,
    marketplaceListings: listings,
    packDir: path.resolve(packDir),
    manifestPath: path.resolve(manifestPath),
    manifestPresent: fs.existsSync(manifestPath),
    manifest,
    coverExists: fs.existsSync(path.join(packDir, 'cover_main.png')),
    detailPngExists: fs.existsSync(path.join(packDir, 'detail_mount_interface.png')),
  };
  await fs.promises.writeFile(OUT, JSON.stringify(snap, null, 2), 'utf8');
  console.log(JSON.stringify(snap, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
