import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const repoRoot = path.resolve(process.cwd(), '..');
const fileName = process.env.TIKTOK_VERIFY_FILE || 'tiktokHPFpPmV3SjlM5fOGdhhZyBQNVNiHi3pE.txt';
const policyPath = (process.env.TIKTOK_VERIFY_POLICY_PATH || '/policies/terms-of-service')
  .replace(/^\/?/, '/')
  .replace(/\/+$/, '');
const filePath = path.join(repoRoot, fileName);
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';
const shop = String(process.env.SHOPIFY_SHOP || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const clientId = process.env.SHOPIFY_CLIENT_ID || '';
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
const externalTarget =
  process.env.TIKTOK_VERIFY_TARGET_URL ||
  `https://www.ivanreseller.com/${fileName}`;

async function getShopifyAccessToken(): Promise<string> {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  if (!shop || !clientId || !clientSecret) {
    throw new Error('Missing SHOPIFY_SHOP, SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET.');
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; errors?: unknown };
  if (!response.ok || !data.access_token) {
    throw new Error(`Could not get Shopify access token: ${response.status} ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function shopifyRest<T>(token: string, method: string, endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data as T;
}

async function main() {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Verification file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8').trim() + '\n';
  const token = await getShopifyAccessToken();

  const redirectPath = `${policyPath}/${fileName}`;
  let redirectTarget = externalTarget;
  let assetUrl: string | null = null;
  let mainTheme: { id: number; name: string } | null = null;

  try {
    const themes = await shopifyRest<{ themes: Array<{ id: number; role: string; name: string }> }>(
      token,
      'GET',
      'themes.json'
    );
    const detectedMainTheme = themes.themes.find((theme) => theme.role === 'main');
    if (detectedMainTheme) {
      await shopifyRest(token, 'PUT', `themes/${detectedMainTheme.id}/assets.json`, {
        asset: {
          key: `assets/${fileName}`,
          value: content,
        },
      });
      mainTheme = { id: detectedMainTheme.id, name: detectedMainTheme.name };
      redirectTarget = `/cdn/shop/t/${detectedMainTheme.id}/assets/${fileName}`;
      assetUrl = `https://shop.ivanreseller.com${redirectTarget}`;
    }
  } catch (error) {
    console.warn(
      `Theme asset upload skipped; falling back to external verification target. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  const existing = await shopifyRest<{ redirects: Array<{ id: number; path: string; target: string }> }>(
    token,
    'GET',
    `redirects.json?path=${encodeURIComponent(redirectPath)}`
  );
  const matchingRedirect = existing.redirects.find((redirect) => redirect.path === redirectPath);
  if (matchingRedirect) {
    await shopifyRest(token, 'PUT', `redirects/${matchingRedirect.id}.json`, {
      redirect: {
        id: matchingRedirect.id,
        path: redirectPath,
        target: redirectTarget,
      },
    });
  } else {
    await shopifyRest(token, 'POST', 'redirects.json', {
      redirect: {
        path: redirectPath,
        target: redirectTarget,
      },
    });
  }

  const verifyUrl = `https://shop.ivanreseller.com${redirectPath}`;

  console.log(JSON.stringify({
    ok: true,
    shop,
    mainTheme,
    fileName,
    verifyUrl,
    redirectTarget,
    assetUrl,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
