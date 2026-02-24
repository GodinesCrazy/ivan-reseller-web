#!/usr/bin/env tsx
/**
 * Asegura que .env.local tenga PAYPAL_ENVIRONMENT=sandbox.
 * No modifica PAYPAL_CLIENT_ID ni PAYPAL_CLIENT_SECRET.
 */
import * as fs from 'fs';
import * as path from 'path';

const envLocal = path.join(process.cwd(), '.env.local');
const line = '\nPAYPAL_ENVIRONMENT=sandbox';

if (!fs.existsSync(envLocal)) {
  fs.writeFileSync(envLocal, 'PAYPAL_ENVIRONMENT=sandbox\n', 'utf8');
  console.log('[ENSURE] Creado .env.local con PAYPAL_ENVIRONMENT=sandbox');
  process.exit(0);
}

const content = fs.readFileSync(envLocal, 'utf8');
if (!/PAYPAL_ENVIRONMENT\s*=/m.test(content)) {
  fs.appendFileSync(envLocal, line + '\n', 'utf8');
  console.log('[ENSURE] Agregado PAYPAL_ENVIRONMENT=sandbox a .env.local');
} else {
  console.log('[ENSURE] PAYPAL_ENVIRONMENT ya existe en .env.local');
}
process.exit(0);
