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
  const listingId = process.argv[2] || 'MLC3827943498';
  clearCredentialsCache(1, 'mercadolibre', 'production');
  const creds = await CredentialsManager.getCredentials(1, 'mercadolibre', 'production') as any;
  const ml = new MercadoLibreService({ accessToken: creds.accessToken, refreshToken: creds.refreshToken, userId: '', siteId: 'MLC', currency: 'CLP', language: 'es' });
  const item = await ml.getItem(listingId) as any;
  console.log(JSON.stringify({ id: item?.id, status: item?.status, health: item?.health, sub_status: item?.sub_status, catalog_listing: item?.catalog_listing, pictures: item?.pictures?.map((p: any) => ({ id: p.id, quality: p.quality })) }, null, 2));
}

main().catch(e => { console.error(e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
