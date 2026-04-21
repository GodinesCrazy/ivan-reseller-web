import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
const backendRoot = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(backendRoot, '.env'))) dotenv.config({ path: path.join(backendRoot, '.env') });
if (fs.existsSync(path.join(backendRoot, '.env.local'))) dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { CredentialsManager, clearCredentialsCache } from '../src/services/credentials-manager.service';
import MercadoLibreService from '../src/services/mercadolibre.service';

async function main() {
  // Product DB state
  const prod = await prisma.product.findUnique({ where: { id: 32722 }, select: { id: true, status: true, isPublished: true, marketplaceListings: { select: { listingId: true, marketplace: true, status: true, price: true } } } });
  console.log('[DB Product 32722]', JSON.stringify(prod, null, 2));

  // ML listing full state
  clearCredentialsCache(1, 'mercadolibre', 'production');
  const creds = await CredentialsManager.getCredentials(1, 'mercadolibre', 'production') as any;
  const ml = new MercadoLibreService({ accessToken: creds.accessToken, refreshToken: creds.refreshToken, userId: '', siteId: 'MLC', currency: 'CLP', language: 'es' });
  const item = await ml.getItem('MLC3828313306') as any;
  console.log('\n[ML Listing MLC3828313306]', JSON.stringify({
    id: item?.id, status: item?.status, health: item?.health,
    sub_status: item?.sub_status, warnings: item?.warnings, tags: item?.tags,
    condition: item?.condition, catalog_listing: item?.catalog_listing, last_updated: item?.last_updated,
    pictures: item?.pictures?.map((p: any) => ({ id: p.id, quality: p.quality, secure_url: p.secure_url?.substring(0,80) })),
  }, null, 2));
}

main().catch(e => { console.error(e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
