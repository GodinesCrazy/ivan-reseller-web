/**
 * Script: check-ml-credentials-and-listing.ts
 * Decrypts ML credentials from DB, then calls ML API to check live listing status
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import https from 'https';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'ivan-reseller-encryption-key-32-chars-minimum-required';
const ENCRYPTION_SALT = process.env.ENCRYPTION_SALT || 'ivanreseller-production-salt-v1';

function decrypt(encryptedText: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, ENCRYPTION_SALT, 32) as Buffer;
  const parts = encryptedText.split(':');
  if (parts.length !== 2) throw new Error('Invalid format: ' + encryptedText.substring(0, 30));
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function httpGet(url: string, token?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    // 1. Get ML credentials from DB
    console.log('\n=== ML CREDENTIALS ===');
    const cred = await (prisma as any).apiCredential.findFirst({
      where: { apiName: 'mercadolibre' },
      orderBy: { updatedAt: 'desc' },
    });

    if (!cred) {
      console.log('No ML credentials found in DB');
      return;
    }

    console.log('Found credentials for userId:', cred.userId);
    console.log('Raw credentials type:', typeof cred.credentials);
    console.log('Raw first 80 chars:', String(cred.credentials).substring(0, 80));

    let accessToken = '';
    let refreshToken = '';
    let clientId = '';
    let clientSecret = '';

    // Try: entire field is one encrypted string
    let rawCreds: any = null;
    const rawStr = String(cred.credentials);
    if (rawStr.includes(':') && !rawStr.startsWith('{')) {
      // Entire credentials field is a single encrypted JSON blob
      try {
        const decrypted = decrypt(rawStr);
        console.log('Decrypted entire field:', decrypted.substring(0, 100));
        rawCreds = JSON.parse(decrypted);
      } catch (e: any) {
        console.log('Decrypt entire field failed:', e.message);
      }
    }

    if (!rawCreds) {
      try {
        rawCreds = JSON.parse(rawStr);
      } catch (e) {
        rawCreds = {};
      }
    }

    console.log('Credential keys:', Object.keys(rawCreds));

    for (const [k, v] of Object.entries(rawCreds)) {
      if (typeof v === 'string' && v.includes(':') && v.length > 30) {
        try {
          const decVal = decrypt(v);
          const display = decVal.substring(0, 50) + (decVal.length > 50 ? '...' : '');
          console.log(`  ${k}: ${display}`);
          if (k === 'accessToken') accessToken = decVal;
          if (k === 'refreshToken') refreshToken = decVal;
          if (k === 'clientId') clientId = decVal;
          if (k === 'clientSecret') clientSecret = decVal;
        } catch (e: any) {
          const raw = String(v).substring(0, 50);
          console.log(`  ${k}: [decrypt failed] raw=${raw}`);
          // Maybe it's stored plain
          if (k === 'accessToken') accessToken = String(v);
          if (k === 'refreshToken') refreshToken = String(v);
          if (k === 'clientId') clientId = String(v);
          if (k === 'clientSecret') clientSecret = String(v);
        }
      } else {
        console.log(`  ${k}: ${String(v).substring(0, 50)}`);
        if (k === 'accessToken') accessToken = String(v);
        if (k === 'refreshToken') refreshToken = String(v);
        if (k === 'clientId') clientId = String(v);
        if (k === 'clientSecret') clientSecret = String(v);
      }
    }

    // 2. Get product 32722 and its listings
    console.log('\n=== PRODUCT 32722 DB STATE ===');
    const product = await (prisma as any).product.findFirst({
      where: { id: 32722 },
      include: { marketplaceListings: { orderBy: { publishedAt: 'desc' } } },
    });

    if (!product) {
      console.log('Product 32722 not found');
    } else {
      console.log(`Product: ${product.name}`);
      console.log(`  currency: ${product.currency}, suggestedPrice: ${product.suggestedPrice}, totalCost: ${product.totalCost}`);
      console.log(`  aliexpressUrl: ${product.aliexpressUrl || '[none]'}`);
      console.log(`  status: ${product.status}`);
      console.log(`\nListings (all):`);
      for (const l of (product.marketplaceListings || [])) {
        console.log(`  [${l.listingId}] status=${l.status} publishedAt=${l.publishedAt} legalTextsAppended=${l.legalTextsAppended} shippingTruthStatus=${l.shippingTruthStatus}`);
      }
    }

    // 3. Check ML API for known listing IDs
    if (accessToken) {
      const listingIds = ['MLC3838127822', 'MLC1913623551', 'MLC1913646427', 'MLC1911535343'];
      console.log('\n=== ML API CHECK (with token) ===');
      for (const id of listingIds) {
        try {
          const res = await httpGet(`https://api.mercadolibre.com/items/${id}`, accessToken);
          if (res.status === 200) {
            console.log(`${id}: status=${res.body.status} title=${res.body.title?.substring(0, 50)} price=${res.body.price} currency=${res.body.currency_id}`);
          } else {
            // Try without token
            const res2 = await httpGet(`https://api.mercadolibre.com/items/${id}`);
            console.log(`${id}: auth=${res.status} public=${res2.status} body=${JSON.stringify(res2.body).substring(0, 80)}`);
          }
        } catch (e: any) {
          console.log(`${id}: error ${e.message}`);
        }
      }
    } else {
      console.log('\nNo access token available - skipping ML API check');
    }

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
