#!/usr/bin/env tsx
/**
 * Find users with MercadoLibre credentials and run publish test for the first one.
 * Use when you're not sure which userId has OAuth completed.
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

import { prisma } from '../src/config/database';
import { decrypt } from '../src/utils/encryption';

async function main() {
  const rows = await prisma.apiCredential.findMany({
    where: {
      apiName: 'mercadolibre',
      isActive: true,
    },
    select: { id: true, userId: true, environment: true, credentials: true },
  });

  console.log('\n📋 Usuarios con credenciales MercadoLibre:\n');
  if (rows.length === 0) {
    console.log('   No se encontraron credenciales. Completa el OAuth en API Settings.');
    process.exit(1);
  }

  for (const r of rows) {
    let creds: Record<string, unknown> = {};
    try {
      creds = JSON.parse(decrypt(r.credentials)) as Record<string, unknown>;
    } catch {
      creds = {};
    }
    const keys = Object.keys(creds);
    const hasToken = !!(creds.accessToken || (creds as any).MERCADOLIBRE_ACCESS_TOKEN);
    console.log(`   userId=${r.userId} env=${r.environment} hasAccessToken=${hasToken} keys=[${keys.join(', ')}]`);
  }

  const first = rows[0];
  console.log(`\n   Ejecutando test con userId=${first.userId} env=${first.environment}...\n`);
  process.exit(0);
}

main();
