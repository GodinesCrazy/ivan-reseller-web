#!/usr/bin/env tsx
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
const backendRoot = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(backendRoot, '.env'))) dotenv.config({ path: path.join(backendRoot, '.env') });
if (fs.existsSync(path.join(backendRoot, '.env.local'))) dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { CredentialsManager, clearCredentialsCache } from '../src/services/credentials-manager.service';
import axios from 'axios';

async function main() {
  const listingId = process.argv[2] || 'MLC3828307770';
  clearCredentialsCache(1, 'mercadolibre', 'production');
  const creds = await CredentialsManager.getCredentials(1, 'mercadolibre', 'production') as any;
  const token = String(creds?.accessToken || creds?.access_token || '');

  const res = await axios.get(`https://api.mercadolibre.com/items/${listingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const item = res.data as any;

  // Print diagnostically interesting fields
  const fields = ['id','status','sub_status','health','warnings','tags','descriptions',
    'thumbnail_id','domain_id','catalog_product_id','attributes'];
  for (const f of fields) {
    if (item[f] !== undefined) {
      const v = JSON.stringify(item[f]);
      console.log(f + ': ' + v.substring(0, 600));
    }
  }
}

main()
  .catch(e => { console.error(e?.message || e); process.exit(1); })
  .finally(() => prisma.$disconnect());
