/**
 * FASE 4 ? Exchange authorization code for AliExpress access_token.
 * Usage: npx tsx -r dotenv/config scripts/get-aliexpress-token.ts "AUTH_CODE"
 * Or:    DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/get-aliexpress-token.ts "AUTH_CODE"
 */

import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.DOTENV_CONFIG_PATH || path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

import { exchangeAuthorizationCode } from '../src/services/aliexpress-oauth.service';

async function main() {
  const code = process.argv[2]?.trim();
  if (!code) {
    console.error('Usage: npx tsx scripts/get-aliexpress-token.ts "<authorization_code>"');
    process.exit(1);
  }

  try {
    const tokenData = await exchangeAuthorizationCode(code);
    console.log('ACCESS_TOKEN=' + tokenData.accessToken);
    console.log('REFRESH_TOKEN=' + tokenData.refreshToken);
    console.log('EXPIRES_IN=' + Math.round((tokenData.expiresAt - Date.now()) / 1000));
    console.log('OK: access_token obtained and stored.');
    process.exit(0);
  } catch (err: any) {
    console.error('ERROR:', err?.message || err);
    process.exit(1);
  }
}

main();
