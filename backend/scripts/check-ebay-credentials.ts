#!/usr/bin/env tsx
/**
 * Diagnóstico: verifica si hay credenciales de eBay con token OAuth.
 * Uso: npx tsx scripts/check-ebay-credentials.ts
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { CredentialsManager } from '../src/services/credentials-manager.service';

async function main() {
  const userId = 1;
  const entry = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'production');
  const creds = entry?.credentials;

  console.log('\n--- Diagnóstico eBay ---');
  console.log('Usuario:', userId, '| Ambiente: production');
  console.log('Credenciales en DB:', entry ? 'Sí' : 'No');
  if (creds) {
    const hasAppId = !!(creds.appId || creds.clientId);
    const hasCertId = !!(creds.certId || creds.clientSecret);
    const hasToken = !!(creds.token || creds.authToken || creds.accessToken);
    const hasRefresh = !!creds.refreshToken;
    console.log('  appId:', hasAppId ? '?' : '?');
    console.log('  certId:', hasCertId ? '?' : '?');
    console.log('  token:', hasToken ? '?' : '?');
    console.log('  refreshToken:', hasRefresh ? '?' : '?');
    if (!hasToken && !hasRefresh) {
      console.log('\n??  Sin token OAuth. Para publicar en eBay:');
      console.log('  1. Completa OAuth en ivanreseller.com ? API Settings ? eBay');
      console.log('  2. O a?ade EBAY_REFRESH_TOKEN a backend/.env.local');
    }
  } else {
    const envRefresh = process.env.EBAY_REFRESH_TOKEN || process.env.EBAY_OAUTH_TOKEN;
    console.log('Env EBAY_REFRESH_TOKEN:', envRefresh ? '?' : '?');
    if (!envRefresh) {
      console.log('\n??  Sin credenciales eBay. A?ade EBAY_CLIENT_ID, EBAY_CLIENT_SECRET y EBAY_REFRESH_TOKEN a .env.local');
    }
  }
  console.log('');
}

main().catch(console.error);
