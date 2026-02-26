#!/usr/bin/env tsx
/**
 * Setup AliExpress credentials and generate authorization URL
 * Then wait for code and test
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load existing .env.local if exists
const envLocalPath = path.join(process.cwd(), '.env.local');
config({ path: envLocalPath, override: true });

// Credentials from env only (never hardcode)
const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();
const REDIRECT_URI = (process.env.ALIEXPRESS_REDIRECT_URI || process.env.ALIEXPRESS_CALLBACK_URL || 'https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback').trim();
const TRACKING_ID = (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim();
if (!APP_KEY || !APP_SECRET) {
  console.error('Configure ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET in .env.local (never in code).');
  process.exit(1);
}

console.log('========================================================');
console.log('ALIEXPRESS CREDENTIALS SETUP & TEST');
console.log('========================================================\n');

// Update .env.local
console.log('?? STEP 1: Configuring credentials...');
const envContent = `
# AliExpress OAuth & Affiliate API Credentials
ALIEXPRESS_APP_KEY=${APP_KEY}
ALIEXPRESS_APP_SECRET=${APP_SECRET}
ALIEXPRESS_REDIRECT_URI=${REDIRECT_URI}
ALIEXPRESS_TRACKING_ID=${TRACKING_ID}
ALIEXPRESS_OAUTH_BASE=https://api-sg.aliexpress.com/oauth
ALIEXPRESS_API_BASE=https://api-sg.aliexpress.com/sync
`.trim();

try {
  // Read existing .env.local if exists
  let existingContent = '';
  if (fs.existsSync(envLocalPath)) {
    existingContent = fs.readFileSync(envLocalPath, 'utf8');
  }

  // Update or add AliExpress variables
  const lines = existingContent.split('\n');
  const newLines: string[] = [];
  const aliExpressKeys = ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_REDIRECT_URI', 'ALIEXPRESS_TRACKING_ID', 'ALIEXPRESS_OAUTH_BASE', 'ALIEXPRESS_API_BASE'];
  let foundAliExpress = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      newLines.push(line);
      continue;
    }
    
    const key = trimmed.split('=')[0].trim();
    if (aliExpressKeys.includes(key)) {
      foundAliExpress = true;
      // Update existing
      if (key === 'ALIEXPRESS_APP_KEY') newLines.push(`ALIEXPRESS_APP_KEY=${APP_KEY}`);
      else if (key === 'ALIEXPRESS_APP_SECRET') newLines.push(`ALIEXPRESS_APP_SECRET=${APP_SECRET}`);
      else if (key === 'ALIEXPRESS_REDIRECT_URI') newLines.push(`ALIEXPRESS_REDIRECT_URI=${REDIRECT_URI}`);
      else if (key === 'ALIEXPRESS_TRACKING_ID') newLines.push(`ALIEXPRESS_TRACKING_ID=${TRACKING_ID}`);
      else if (key === 'ALIEXPRESS_OAUTH_BASE') newLines.push(`ALIEXPRESS_OAUTH_BASE=https://api-sg.aliexpress.com/oauth`);
      else if (key === 'ALIEXPRESS_API_BASE') newLines.push(`ALIEXPRESS_API_BASE=https://api-sg.aliexpress.com/sync`);
      else newLines.push(line);
    } else {
      newLines.push(line);
    }
  }

  // Add AliExpress section if not found
  if (!foundAliExpress) {
    if (newLines.length > 0 && !newLines[newLines.length - 1].trim().endsWith('')) {
      newLines.push('');
    }
    newLines.push('# AliExpress OAuth & Affiliate API Credentials');
    newLines.push(`ALIEXPRESS_APP_KEY=${APP_KEY}`);
    newLines.push(`ALIEXPRESS_APP_SECRET=${APP_SECRET}`);
    newLines.push(`ALIEXPRESS_REDIRECT_URI=${REDIRECT_URI}`);
    newLines.push(`ALIEXPRESS_TRACKING_ID=${TRACKING_ID}`);
    newLines.push(`ALIEXPRESS_OAUTH_BASE=https://api-sg.aliexpress.com/oauth`);
    newLines.push(`ALIEXPRESS_API_BASE=https://api-sg.aliexpress.com/sync`);
  }

  fs.writeFileSync(envLocalPath, newLines.join('\n'), 'utf8');
  console.log('? Credentials configured in .env.local\n');
} catch (error: any) {
  console.error('? Error writing .env.local:', error.message);
  console.log('\nPlease manually add to .env.local:');
  console.log(envContent);
}

// Generate authorization URL
console.log('?? STEP 2: Generating authorization URL...');
const authUrl = `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

console.log('? Authorization URL generated!\n');
console.log('========================================================');
console.log('?? URL DE AUTORIZACIÓN:');
console.log('========================================================');
console.log(authUrl);
console.log('========================================================\n');

console.log('?? INSTRUCCIONES:');
console.log('----------------------------------------');
console.log('1. Abre la URL de arriba en tu navegador');
console.log('2. Inicia sesión en AliExpress si es necesario');
console.log('3. Autoriza la aplicación');
console.log('4. Serás redirigido a una URL como esta:');
console.log(`   ${REDIRECT_URI}?code=TU_CODIGO_AQUI`);
console.log('5. Copia el valor del parámetro "code" de la URL');
console.log('6. Ejecuta: npx tsx scripts/test-aliexpress-full-flow.ts TU_CODIGO_AQUI\n');

// Check if code provided as argument
const code = process.argv[2];
if (code) {
  console.log('?? STEP 3: Testing with provided code...\n');
  // Import and run test script
  import('./test-aliexpress-full-flow.ts').then(() => {
    // The test script will handle the rest
  }).catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
} else {
  console.log('?? Para ejecutar el test completo, proporciona el código:');
  console.log('   npx tsx scripts/setup-and-test-aliexpress.ts TU_CODIGO_AQUI\n');
}
