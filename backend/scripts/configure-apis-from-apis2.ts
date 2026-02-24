#!/usr/bin/env tsx
/**
 * Configura APIs obligatorias para Autopilot desde APIS2.txt y APIS2_REFERENCE.md.
 * - Extrae ScraperAPI, ZenRows y eBay produccin.
 * - Escribe backend/.env.local (SCRAPERAPI_KEY, ZENROWS_API_KEY, EBAY_*).
 * - Inserta/actualiza credenciales en api_credentials para el primer usuario activo con paypalPayoutEmail.
 * Solo usa valores reales del archivo; no simula ni inventa claves.
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';

const backendDir = process.cwd();
config({ path: path.join(backendDir, '.env'), override: false });
config({ path: path.join(backendDir, '.env.local'), override: true });

const apis2Root = path.join(backendDir, '..', 'APIS2.txt');
const apis2Backend = path.join(backendDir, 'APIS2.txt');
const apis2Path = fs.existsSync(apis2Root) ? apis2Root : (fs.existsSync(apis2Backend) ? apis2Backend : null);

function readApis2(): string {
  if (!apis2Path || !fs.existsSync(apis2Path)) {
    throw new Error('APIS2.txt not found in project root or backend/');
  }
  return fs.readFileSync(apis2Path, 'utf8');
}

function extractScraping(content: string): { scraperApiKey: string | null; zenrowsKey: string | null } {
  const scraper = (content.match(/ScraperAPI\s+Key\s*:\s*(\S+)/i) || content.match(/ScraperAPI\s+Key\s+(\S+)/i))?.[1]?.trim();
  const zenrows = (content.match(/ZenRows\s+API:\s*(\S+)/i) || content.match(/ZenRows\s+API\s*:\s*(\S+)/i))?.[1]?.trim();
  return { scraperApiKey: scraper || null, zenrowsKey: zenrows || null };
}

function extractEbayProduction(content: string): { appId: string | null; devId: string | null; certId: string | null; redirectUri: string | null } {
  const prodSection = content.includes('eBay produccin') || content.includes('eBay producci');
  const idx = content.indexOf('eBay produccin');
  const section = idx >= 0 ? content.slice(idx, idx + 800) : content;
  const appId = (section.match(/App\s+ID\s*\([^)]*\)\s*(\S+)/i) || section.match(/App\s+ID\s*\(Client ID\)\s*(\S+)/i))?.[1]?.trim()
    || (section.match(/IvanMart-IVANRese-PRD-[a-f0-9-]+/))?.[0];
  const devId = (section.match(/Dev\s+ID\s+(\S+)/i))?.[1]?.trim() || content.match(/Dev\s+ID\s+([a-f0-9-]{36})/i)?.[1]?.trim();
  const certId = (section.match(/Cert\s+ID\s*\([^)]*\)\s*(\S+)/i) || section.match(/Cert\s+ID\s*\(Client Secret\)\s*(\S+)/i))?.[1]?.trim()
    || (section.match(/PRD-[a-f0-9-]+/g))?.[1];
  const redirectUri = (section.match(/Redirect\s+URI\s*\(RuName\)\s*(\S+)/i) || section.match(/Redirect\s+URI\s*\([^)]*\)\s*(\S+)/i))?.[1]?.trim()
    || (section.match(/Ivan_Marty-IvanMart-IVANRe-\w+/))?.[0];
  return {
    appId: appId || null,
    devId: devId || null,
    certId: certId || null,
    redirectUri: redirectUri || null
  };
}

function parseEnvLocal(filePath: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(filePath)) return m;
  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) m.set(match[1], match[2].replace(/^["']|["']$/g, '').trim());
  });
  return m;
}

function writeEnvLocal(filePath: string, updates: Record<string, string>): void {
  const map = parseEnvLocal(filePath);
  for (const [k, v] of Object.entries(updates)) {
    if (v) map.set(k, v);
  }
  const lines: string[] = [];
  const written = new Set<string>();
  if (fs.existsSync(filePath)) {
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && map.has(match[1])) {
        lines.push(`${match[1]}=${map.get(match[1])}`);
        written.add(match[1]);
      } else {
        lines.push(line);
      }
    });
  }
  const order = ['SCRAPERAPI_KEY', 'ZENROWS_API_KEY', 'EBAY_APP_ID', 'EBAY_DEV_ID', 'EBAY_CERT_ID', 'EBAY_REDIRECT_URI'];
  for (const k of order) {
    if (map.has(k) && !written.has(k)) lines.push(`${k}=${map.get(k)}`);
  }
  for (const [k, v] of map) {
    if (!order.includes(k) && !written.has(k)) lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

async function main(): Promise<number> {
  console.log('[CONFIGURE-APIS] Reading APIS2.txt...');
  const content = readApis2();

  const { scraperApiKey, zenrowsKey } = extractScraping(content);
  const ebay = extractEbayProduction(content);

  const envPath = path.join(backendDir, '.env.local');
  if (!fs.existsSync(envPath)) {
    const example = path.join(backendDir, 'env.local.example');
    if (fs.existsSync(example)) fs.copyFileSync(example, envPath);
    else fs.writeFileSync(envPath, '', 'utf8');
  }

  const envUpdates: Record<string, string> = {};
  if (scraperApiKey) {
    envUpdates.SCRAPERAPI_KEY = scraperApiKey;
    console.log('[CONFIGURE-APIS] SCRAPERAPI_KEY found, writing to .env.local');
  }
  if (zenrowsKey) {
    envUpdates.ZENROWS_API_KEY = zenrowsKey;
    console.log('[CONFIGURE-APIS] ZENROWS_API_KEY found, writing to .env.local');
  }
  if (ebay.appId) envUpdates.EBAY_APP_ID = ebay.appId;
  if (ebay.devId) envUpdates.EBAY_DEV_ID = ebay.devId;
  if (ebay.certId) envUpdates.EBAY_CERT_ID = ebay.certId;
  if (ebay.redirectUri) envUpdates.EBAY_REDIRECT_URI = ebay.redirectUri;
  if (Object.keys(envUpdates).length > 0) {
    writeEnvLocal(envPath, envUpdates);
    console.log('[CONFIGURE-APIS] .env.local updated');
  }

  const { prisma } = await import('../src/config/database');
  const { CredentialsManager } = await import('../src/services/credentials-manager.service');

  const user = await prisma.user.findFirst({
    where: { isActive: true, paypalPayoutEmail: { not: null } },
    select: { id: true, username: true },
  });
  if (!user) {
    console.warn('[CONFIGURE-APIS] No active user with paypalPayoutEmail; skipping DB credentials.');
    console.log('[CONFIGURE-APIS] Done. Restart backend and run activate-live-profit-mode if needed.');
    return 0;
  }

  const userId = user.id;
  let saved = 0;

  if (scraperApiKey) {
    try {
      await CredentialsManager.saveCredentials(userId, 'scraperapi', { apiKey: scraperApiKey }, 'production');
      console.log('[CONFIGURE-APIS] Saved scraperapi credentials for user', userId);
      saved++;
    } catch (e: any) {
      console.warn('[CONFIGURE-APIS] save scraperapi failed:', e?.message || e);
    }
  }
  if (zenrowsKey) {
    try {
      await CredentialsManager.saveCredentials(userId, 'zenrows', { apiKey: zenrowsKey }, 'production');
      console.log('[CONFIGURE-APIS] Saved zenrows credentials for user', userId);
      saved++;
    } catch (e: any) {
      console.warn('[CONFIGURE-APIS] save zenrows failed:', e?.message || e);
    }
  }
  if (ebay.appId && ebay.devId && ebay.certId && ebay.redirectUri) {
    try {
      await CredentialsManager.saveCredentials(userId, 'ebay', {
        appId: ebay.appId,
        devId: ebay.devId,
        certId: ebay.certId,
        redirectUri: ebay.redirectUri,
        sandbox: false,
      }, 'production');
      console.log('[CONFIGURE-APIS] Saved ebay (production) credentials for user', userId);
      saved++;
    } catch (e: any) {
      console.warn('[CONFIGURE-APIS] save ebay failed:', e?.message || e);
    }
  }

  console.log('[CONFIGURE-APIS] Credentials in DB:', saved);
  await prisma.$disconnect();
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
