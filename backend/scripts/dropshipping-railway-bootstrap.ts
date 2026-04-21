#!/usr/bin/env tsx
/**
 * Bootstrap AliExpress Dropshipping tokens for Railway (local machine).
 *
 * Loads `.env` then `.env.local` (local overrides) from backend root.
 *
 * Modes:
 *   1) Refresh: if ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN or ALIEXPRESS_DROPSHIPPING_REFRESH is set
 *      (+ APP_KEY / APP_SECRET), calls AliExpress refresh and prints Railway-ready lines.
 *   2) Code exchange: pass OAuth `code` as first arg (same as test-dropshipping-token-exchange-v2).
 *   3) Otherwise: prints authorize URL and instructions (use --open to launch browser).
 *
 *   --print-railway-vars  Print full ACCESS_TOKEN / REFRESH_TOKEN lines (sensitive; copy to Railway).
 *
 * Usage:
 *   npx tsx scripts/dropshipping-railway-bootstrap.ts
 *   npx tsx scripts/dropshipping-railway-bootstrap.ts "3_522578_xxxxx"
 *   npx tsx scripts/dropshipping-railway-bootstrap.ts --print-railway-vars
 *   npx tsx scripts/dropshipping-railway-bootstrap.ts --open
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getAliExpressDropshippingRedirectUri } from '../src/utils/aliexpress-dropshipping-oauth';

const backendRoot = path.resolve(__dirname, '..');

function loadEnvFiles(): void {
  const envPath = path.join(backendRoot, '.env');
  const localPath = path.join(backendRoot, '.env.local');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
  if (fs.existsSync(localPath)) dotenv.config({ path: localPath, override: true });
}

function mask(value: string, visible = 8): string {
  if (!value) return '(empty)';
  if (value.length <= visible) return '*'.repeat(value.length);
  return `${value.slice(0, visible)}…`;
}

function pickRefresh(): string {
  return (
    process.env.ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN ||
    process.env.ALIEXPRESS_DROPSHIPPING_REFRESH ||
    ''
  ).trim();
}

function pickAccess(): string {
  return (
    process.env.ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN ||
    process.env.ALIEXPRESS_DROPSHIPPING_TOKEN ||
    ''
  ).trim();
}

function printRailwaySnippet(accessToken: string, refreshToken: string): void {
  console.log('');
  console.log('--- Copiar en Railway → servicio backend → Variables ---');
  console.log(`ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN=${accessToken}`);
  if (refreshToken) {
    console.log(`ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN=${refreshToken}`);
  }
  console.log('--- fin ---');
  console.log('');
}

function printAuthUrlAndHint(openBrowser: boolean): void {
  const appKey = (process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
  const redirectUri = getAliExpressDropshippingRedirectUri();
  if (!appKey) {
    console.error('Falta ALIEXPRESS_DROPSHIPPING_APP_KEY en .env / .env.local');
    process.exit(1);
  }
  const params = new URLSearchParams({
    response_type: 'code',
    force_auth: 'true',
    client_id: appKey,
    redirect_uri: redirectUri,
    state: 'ivanreseller-cli',
  });
  const authUrl = `https://api-sg.aliexpress.com/oauth/authorize?${params.toString()}`;
  console.log('No hay refresh token en env. Abre esta URL, autoriza, y copia el `code` de la URL de retorno.');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('Luego ejecuta:');
  console.log(`  npx tsx scripts/dropshipping-railway-bootstrap.ts "<CODE>" --print-railway-vars`);
  console.log('redirectUri usado:', redirectUri);

  if (openBrowser) {
    const { execSync } = require('child_process') as typeof import('child_process');
    let openCmd: string;
    if (process.platform === 'win32') {
      openCmd = `powershell -Command "Start-Process '${authUrl.replace(/'/g, "''")}'"`;
    } else if (process.platform === 'darwin') {
      openCmd = `open "${authUrl}"`;
    } else {
      openCmd = `xdg-open "${authUrl}"`;
    }
    execSync(openCmd, { stdio: 'inherit', shell: true });
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const args = process.argv.slice(2).filter((a) => a !== '--print-railway-vars');
  const printVars = process.argv.includes('--print-railway-vars');
  const openBrowser = process.argv.includes('--open');

  const appKey = (process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
  const appSecret = (process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '').trim();

  const codeArg = args.find((a) => !a.startsWith('--'));
  if (codeArg && !codeArg.startsWith('--')) {
    if (!appKey || !appSecret) {
      console.error('Faltan ALIEXPRESS_DROPSHIPPING_APP_KEY / APP_SECRET');
      process.exit(1);
    }
    const redirectUri = getAliExpressDropshippingRedirectUri();
    const { aliexpressDropshippingAPIService } = await import(
      '../src/services/aliexpress-dropshipping-api.service'
    );
    console.log('Intercambiando código OAuth…');
    const tokens = await aliexpressDropshippingAPIService.exchangeCodeForToken(
      codeArg,
      redirectUri,
      appKey,
      appSecret
    );
    console.log('OK — access:', mask(tokens.accessToken, 12), 'refresh:', mask(tokens.refreshToken, 12));
    if (printVars) printRailwaySnippet(tokens.accessToken, tokens.refreshToken);
    else {
      console.log('Vuelve a ejecutar con --print-railway-vars para ver las líneas listas para Railway.');
    }
    process.exit(0);
  }

  const refresh = pickRefresh();
  if (refresh && appKey && appSecret) {
    const { aliexpressDropshippingAPIService } = await import(
      '../src/services/aliexpress-dropshipping-api.service'
    );
    console.log('Renovando access_token con refresh_token del entorno…');
    const tokens = await aliexpressDropshippingAPIService.refreshAccessToken(refresh, appKey, appSecret);
    console.log('OK — access:', mask(tokens.accessToken, 12), 'refresh:', mask(tokens.refreshToken, 12));
    if (printVars) printRailwaySnippet(tokens.accessToken, tokens.refreshToken);
    else {
      console.log('Vuelve a ejecutar con --print-railway-vars para ver las líneas listas para Railway.');
    }
    process.exit(0);
  }

  // Si ya hay access en local, solo recordatorio
  const existing = pickAccess();
  if (existing && !refresh) {
    console.log('Hay ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN en env pero no refresh.');
    console.log('Si el access sigue válido, puedes copiarlo a Railway manualmente.');
    console.log('access (mascarado):', mask(existing, 12));
    if (printVars) printRailwaySnippet(existing, '');
    process.exit(0);
  }

  printAuthUrlAndHint(openBrowser);
  process.exit(2);
}

main().catch((e: any) => {
  console.error('Error:', e?.message || e);
  process.exit(1);
});
