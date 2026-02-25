/**
 * Configura APIs obligatorias para Autopilot desde APIS2.txt y APIS2_REFERENCE.md.
 * - Extrae ScraperAPI, ZenRows y eBay producci�n.
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

const projectRoot = path.join(backendDir, '..');
const apis2Root = path.join(projectRoot, 'APIS2.txt');
const apis2Backend = path.join(backendDir, 'APIS2.txt');
const apis2Path = fs.existsSync(apis2Root) ? apis2Root : (fs.existsSync(apis2Backend) ? apis2Backend : null);
const railPath = path.join(projectRoot, 'rail.txt');

function readApis2(): string {
  if (!apis2Path || !fs.existsSync(apis2Path)) {
    throw new Error('APIS2.txt not found in project root or backend/');
  }
  return fs.readFileSync(apis2Path, 'utf8');
}

function readRail(): string {
  if (!fs.existsSync(railPath)) return '';
  return fs.readFileSync(railPath, 'utf8');
}

function extractScraping(content: string): { scraperApiKey: string | null; zenrowsKey: string | null } {
  const scraper = (content.match(/ScraperAPI\s+Key\s*:\s*(\S+)/i) || content.match(/ScraperAPI\s+Key\s+(\S+)/i))?.[1]?.trim();
  const zenrows = (content.match(/ZenRows\s+API:\s*(\S+)/i) || content.match(/ZenRows\s+API\s*:\s*(\S+)/i))?.[1]?.trim();
  return { scraperApiKey: scraper || null, zenrowsKey: zenrows || null };
}

function extractEbayProduction(content: string): { appId: string | null; devId: string | null; certId: string | null; redirectUri: string | null } {
  const prdIdx = content.indexOf('IvanMart-IVANRese-PRD-');
  const idx = prdIdx >= 0 ? Math.max(0, prdIdx - 300) : content.search(/eBay\s+prod/u);
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

function extractEbaySandbox(content: string): { appId: string | null; devId: string | null; certId: string | null; redirectUri: string | null } {
  const idx = content.indexOf('eBay (SandBox)') >= 0 ? content.indexOf('eBay (SandBox)') : content.indexOf('eBay Sandbox');
  const section = idx >= 0 ? content.slice(idx, idx + 700) : content;
  const appId = (section.match(/App\s+ID\s*\([^)]*\)\s*(\S+)/i) || section.match(/IvanMart-IVANRese-SBX-[a-f0-9-]+/))?.[1]?.trim()
    || (section.match(/IvanMart-IVANRese-SBX-[a-f0-9-]+/))?.[0];
  const devId = (section.match(/Dev\s+ID\s+(\S+)/i))?.[1]?.trim();
  const certId = (section.match(/Cert\s+ID\s*\([^)]*\)\s*(\S+)/i))?.[1]?.trim() || (section.match(/SBX-[a-f0-9-]+/))?.[0];
  const redirectUri = (section.match(/Redirect\s+URI\s*\(RuName\)\s*(\S+)/i))?.[1]?.trim() || (section.match(/Ivan_Marty-IvanMart-IVANRe-\w+/))?.[0];
  return { appId: appId || null, devId: devId || null, certId: certId || null, redirectUri: redirectUri || null };
}

function extractPayPal(content: string): { sandboxClientId: string | null; sandboxSecret: string | null; liveClientId: string | null; liveSecret: string | null } {
  // APIS2: "Sandbox: Client ID EEKi...", "Live: Client ID EKj..."; luego bloques "Client ID AdLn34...", "Secret EEKi..."; "client ID AYH1...", "secret Key EKj..."
  const sandboxClientId = (content.match(/Sandbox:\s*\n\s*Client\s+ID\s+(\S+)/i) || content.match(/Client\s+ID\s+(EEKi\S+)/))?.[1]?.trim();
  const liveClientId = (content.match(/Live:\s*\n\s*Client\s+ID\s+(\S+)/i) || content.match(/Client\s+ID\s+(EKj\S+)/) || content.match(/client\s+ID\s+(AYH1\S+)/i))?.[1]?.trim();
  const secretEeki = (content.match(/Secret\s+(EEKi\S+)/i))?.[1]?.trim();
  const secretEkj = (content.match(/secret\s+Key\s+(EKj\S+)/i) || content.match(/secret\s+Key\s+(\S+)/i))?.[1]?.trim();
  const clientAdLn = (content.match(/Client\s+ID\s+(AdLn\S+)/))?.[1]?.trim();
  return {
    sandboxClientId: clientAdLn || sandboxClientId || null,
    sandboxSecret: secretEeki || null,
    liveClientId: liveClientId || (content.match(/client\s+ID\s+(AYH1\S+)/i))?.[1]?.trim() || null,
    liveSecret: secretEkj || null,
  };
}

function extractStripe(content: string): { publishableKey: string | null; secretKey: string | null } {
  const pk = (content.match(/STRIPE_SECRET_KEY\s+(pk_test_\S+)/i) || content.match(/pk_test_\S+/))?.[1] || (content.match(/(pk_test_[A-Za-z0-9]+)/))?.[1];
  const sk = (content.match(/STRIPE_WEBHOOK_SECRET\s+(sk_test_\S+)/i) || content.match(/sk_test_\S+/))?.[1] || (content.match(/(sk_test_[A-Za-z0-9]+)/))?.[1];
  return {
    publishableKey: pk?.trim() || null,
    secretKey: sk?.trim() || null,
  };
}

function extractAI(content: string): { groq: string | null; openai: string | null; gemini: string | null } {
  const groq = (content.match(/groq\s*:\s*(\S+)/i))?.[1]?.trim() || (content.match(/(gsk_[A-Za-z0-9]+)/))?.[1]?.trim() || null;
  const openai = (content.match(/OpenAI\s*\n\s*(sk-proj-\S+)/i))?.[1]?.trim() || (content.match(/(sk-proj-[A-Za-z0-9_-]+)/))?.[1]?.trim() || null;
  const gemini = (content.match(/GEMINI_API_KEY\s+(\S+)/i))?.[1]?.trim() || (content.match(/(AIzaSy[A-Za-z0-9_-]+)/))?.[1]?.trim() || null;
  return { groq, openai, gemini };
}

function extractSerp(content: string): string | null {
  return (content.match(/SerpAPI\s+Key\s+(\S+)/i) || content.match(/SERP_API_KEY\s+(\S+)/i))?.[1]?.trim() || null;
}

function extractSendGrid(content: string): string | null {
  return (content.match(/SENDGRID_API_KEY\s+(\S+)/i))?.[1]?.trim() || null;
}

function extractAliExpress(content: string): {
  dropshipAppKey: string | null;
  dropshipAppSecret: string | null;
  affiliateAppKey: string | null;
  affiliateAppSecret: string | null;
  affiliateTrackingId: string | null;
  dropshipTrackingId: string | null;
} {
  const dropIdx = content.indexOf('Drop Shipping');
  const affIdx = content.indexOf('Affiliates API');
  const dropSection = dropIdx >= 0 ? content.slice(dropIdx, affIdx >= 0 ? affIdx : content.length) : content;
  const affSection = affIdx >= 0 ? content.slice(affIdx, content.length) : content;
  const dropshipAppKey = (dropSection.match(/AppKey\s*\n\s*(\d+)/) || dropSection.match(/AppKey\s+(\d+)/))?.[1]?.trim() || null;
  const dropshipAppSecret = (dropSection.match(/App Secret\s*\n\s*([A-Za-z0-9]+)/) || content.match(/(uWGIINO42[A-Za-z0-9]+)/))?.[1]?.trim() || null;
  const affiliateAppKey = (affSection.match(/AppKey\s*\n\s*(\d+)/) || affSection.match(/AppKey\s+(\d+)/))?.[1]?.trim() || null;
  const affiliateAppSecret = (affSection.match(/App Secret\s*\n\s*(\S+)/) || content.match(/(OKxmE8VL[A-Za-z0-9]+)/))?.[1]?.replace(/\s+HideReset.*$/, '').trim() || null;
  const affiliateTrackingId = (content.match(/ALIEXPRESS_AFFILIATE_TRACKING_ID=(\S+)/))?.[1]?.trim() || null;
  const dropshipTrackingId = (content.match(/ALIEXPRESS_DROPSHIPPING_TRACKING_ID=(\S+)/))?.[1]?.trim() || null;
  return {
    dropshipAppKey,
    dropshipAppSecret,
    affiliateAppKey,
    affiliateAppSecret,
    affiliateTrackingId,
    dropshipTrackingId,
  };
}

function extractInternalSecret(content: string): string | null {
  return (content.match(/INTERNAL_RUN_SECRET\s*=\s*(\S+)/))?.[1]?.trim() || null;
}

function parseRail(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  });
  return out;
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
  const order = [
    'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY',
    'EBAY_SANDBOX_APP_ID', 'EBAY_SANDBOX_DEV_ID', 'EBAY_SANDBOX_CERT_ID', 'EBAY_SANDBOX_REDIRECT_URI',
    'EBAY_PRODUCTION_APP_ID', 'EBAY_PRODUCTION_DEV_ID', 'EBAY_PRODUCTION_CERT_ID', 'EBAY_PRODUCTION_REDIRECT_URI',
    'EBAY_APP_ID', 'EBAY_DEV_ID', 'EBAY_CERT_ID', 'EBAY_REDIRECT_URI', 'EBAY_RUNAME',
    'SCRAPERAPI_KEY', 'ZENROWS_API_KEY',
    'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_ENVIRONMENT',
    'PAYPAL_SANDBOX_CLIENT_ID', 'PAYPAL_SANDBOX_CLIENT_SECRET',
    'PAYPAL_PRODUCTION_CLIENT_ID', 'PAYPAL_PRODUCTION_CLIENT_SECRET',
    'STRIPE_PUBLIC_KEY', 'STRIPE_SECRET_KEY',
    'SENDGRID_API_KEY', 'SERP_API_KEY',
    'ALIEXPRESS_DROPSHIPPING_APP_KEY', 'ALIEXPRESS_DROPSHIPPING_APP_SECRET',
    'ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_AFFILIATE_APP_KEY', 'ALIEXPRESS_AFFILIATE_APP_SECRET',
    'ALIEXPRESS_AFFILIATE_TRACKING_ID', 'ALIEXPRESS_DROPSHIPPING_TRACKING_ID',
    'ALLOW_BROWSER_AUTOMATION', 'ALIEXPRESS_USER', 'ALIEXPRESS_PASS', 'INTERNAL_RUN_SECRET',
  ];
  for (const k of order) {
    if (map.has(k) && !written.has(k)) lines.push(`${k}=${map.get(k)}`);
  }
  for (const [k, v] of map) {
    if (!order.includes(k) && !written.has(k)) lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

async function main(): Promise<number> {
  console.log('[CONFIGURE-APIS] Reading APIS2.txt and rail.txt...');
  const content = readApis2();
  const railContent = readRail();

  const { scraperApiKey, zenrowsKey } = extractScraping(content);
  const ebayProd = extractEbayProduction(content);
  const ebaySandbox = extractEbaySandbox(content);
  const paypal = extractPayPal(content);
  const stripe = extractStripe(content);
  const ai = extractAI(content);
  const serpKey = extractSerp(content);
  const sendGridKey = extractSendGrid(content);
  const aliexpress = extractAliExpress(content);
  const internalSecret = extractInternalSecret(content);
  const railVars = parseRail(railContent);

  const envPath = path.join(backendDir, '.env.local');
  if (!fs.existsSync(envPath)) {
    const example = path.join(backendDir, 'env.local.example');
    if (fs.existsSync(example)) fs.copyFileSync(example, envPath);
    else fs.writeFileSync(envPath, '', 'utf8');
  }

  const envUpdates: Record<string, string> = {};

  if (ai.groq) envUpdates.GROQ_API_KEY = ai.groq;
  if (ai.openai) envUpdates.OPENAI_API_KEY = ai.openai;
  if (ai.gemini) envUpdates.GEMINI_API_KEY = ai.gemini;
  if (serpKey) envUpdates.SERP_API_KEY = serpKey;
  if (sendGridKey) envUpdates.SENDGRID_API_KEY = sendGridKey;

  if (scraperApiKey) envUpdates.SCRAPERAPI_KEY = scraperApiKey;
  if (zenrowsKey) envUpdates.ZENROWS_API_KEY = zenrowsKey;

  if (ebaySandbox.appId) envUpdates.EBAY_SANDBOX_APP_ID = ebaySandbox.appId;
  if (ebaySandbox.devId) envUpdates.EBAY_SANDBOX_DEV_ID = ebaySandbox.devId;
  if (ebaySandbox.certId) envUpdates.EBAY_SANDBOX_CERT_ID = ebaySandbox.certId;
  if (ebaySandbox.redirectUri) envUpdates.EBAY_SANDBOX_REDIRECT_URI = ebaySandbox.redirectUri;
  if (ebayProd.appId) envUpdates.EBAY_PRODUCTION_APP_ID = ebayProd.appId;
  if (ebayProd.devId) envUpdates.EBAY_PRODUCTION_DEV_ID = ebayProd.devId;
  if (ebayProd.certId) envUpdates.EBAY_PRODUCTION_CERT_ID = ebayProd.certId;
  if (ebayProd.redirectUri) envUpdates.EBAY_PRODUCTION_REDIRECT_URI = ebayProd.redirectUri;
  if (ebayProd.appId) envUpdates.EBAY_APP_ID = ebayProd.appId;
  if (ebayProd.devId) envUpdates.EBAY_DEV_ID = ebayProd.devId;
  if (ebayProd.certId) envUpdates.EBAY_CERT_ID = ebayProd.certId;
  if (ebayProd.redirectUri) {
    envUpdates.EBAY_REDIRECT_URI = ebayProd.redirectUri;
    envUpdates.EBAY_RUNAME = ebayProd.redirectUri;
  }

  if (paypal.sandboxClientId) envUpdates.PAYPAL_SANDBOX_CLIENT_ID = paypal.sandboxClientId;
  if (paypal.sandboxSecret) envUpdates.PAYPAL_SANDBOX_CLIENT_SECRET = paypal.sandboxSecret;
  if (paypal.liveClientId) envUpdates.PAYPAL_PRODUCTION_CLIENT_ID = paypal.liveClientId;
  if (paypal.liveSecret) envUpdates.PAYPAL_PRODUCTION_CLIENT_SECRET = paypal.liveSecret;
  if (paypal.sandboxClientId) envUpdates.PAYPAL_CLIENT_ID = paypal.sandboxClientId;
  if (paypal.sandboxSecret) envUpdates.PAYPAL_CLIENT_SECRET = paypal.sandboxSecret;
  envUpdates.PAYPAL_ENVIRONMENT = 'sandbox';

  if (stripe.publishableKey) envUpdates.STRIPE_PUBLIC_KEY = stripe.publishableKey;
  if (stripe.secretKey) envUpdates.STRIPE_SECRET_KEY = stripe.secretKey;

  if (aliexpress.dropshipAppKey) envUpdates.ALIEXPRESS_DROPSHIPPING_APP_KEY = aliexpress.dropshipAppKey;
  if (aliexpress.dropshipAppSecret) envUpdates.ALIEXPRESS_DROPSHIPPING_APP_SECRET = aliexpress.dropshipAppSecret;
  if (aliexpress.affiliateAppKey) {
    envUpdates.ALIEXPRESS_APP_KEY = aliexpress.affiliateAppKey;
    envUpdates.ALIEXPRESS_AFFILIATE_APP_KEY = aliexpress.affiliateAppKey;
  }
  if (aliexpress.affiliateAppSecret) {
    envUpdates.ALIEXPRESS_APP_SECRET = aliexpress.affiliateAppSecret;
    envUpdates.ALIEXPRESS_AFFILIATE_APP_SECRET = aliexpress.affiliateAppSecret;
  }
  if (aliexpress.affiliateTrackingId) envUpdates.ALIEXPRESS_AFFILIATE_TRACKING_ID = aliexpress.affiliateTrackingId;
  if (aliexpress.dropshipTrackingId) envUpdates.ALIEXPRESS_DROPSHIPPING_TRACKING_ID = aliexpress.dropshipTrackingId;

  if (internalSecret) envUpdates.INTERNAL_RUN_SECRET = internalSecret;

  for (const [k, v] of Object.entries(railVars)) {
    if (v && ['ALLOW_BROWSER_AUTOMATION', 'ALIEXPRESS_USER', 'ALIEXPRESS_PASS', 'INTERNAL_RUN_SECRET'].includes(k)) {
      envUpdates[k] = v;
    }
  }

  if (Object.keys(envUpdates).length > 0) {
    writeEnvLocal(envPath, envUpdates);
    console.log('[CONFIGURE-APIS] .env.local updated with', Object.keys(envUpdates).length, 'variables');
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
  if (ebayProd.appId && ebayProd.devId && ebayProd.certId && ebayProd.redirectUri) {
    try {
      await CredentialsManager.saveCredentials(userId, 'ebay', {
        appId: ebayProd.appId,
        devId: ebayProd.devId,
        certId: ebayProd.certId,
        redirectUri: ebayProd.redirectUri,
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
