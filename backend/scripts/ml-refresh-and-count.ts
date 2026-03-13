/**
 * Refresca el token de ML y obtiene el total de publicaciones desde la API.
 * Uso: npx tsx scripts/ml-refresh-and-count.ts [userId]
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import axios from 'axios';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const { prisma } = await import('../src/config/database');
  const { MarketplaceService } = await import('../src/services/marketplace.service');
  const { CredentialsManager, clearCredentialsCache } = await import('../src/services/credentials-manager.service');

  let userId = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  if (!userId || isNaN(userId)) {
    const row = await prisma.marketplaceListing.findFirst({
      where: { marketplace: 'mercadolibre' },
      select: { userId: true },
    });
    if (!row) {
      const cred = await prisma.apiCredential.findFirst({
        where: { apiName: 'mercadolibre', isActive: true },
        select: { userId: true },
      });
      userId = cred?.userId ?? null;
    } else {
      userId = row!.userId;
    }
  }
  if (!userId) {
    console.error('No hay usuario con credenciales/listings ML. Indica: npx tsx scripts/ml-refresh-and-count.ts <userId>');
    process.exit(1);
  }

  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(userId, 'mercadolibre');
  if (!creds?.isActive || !creds.credentials) {
    console.error('Usuario sin credenciales ML activas');
    process.exit(1);
  }

  const c = creds.credentials as { accessToken: string; refreshToken?: string; userId: string; clientId?: string; clientSecret?: string };
  if (!c.refreshToken) {
    console.error('No hay refresh_token. Reconecta ML desde la app (Settings → API Credentials).');
    process.exit(1);
  }

  const { MercadoLibreService } = await import('../src/services/mercadolibre.service');
  const mlService = new MercadoLibreService({
    ...c,
    clientId: c.clientId || process.env.MERCADOLIBRE_CLIENT_ID || '',
    clientSecret: c.clientSecret || process.env.MERCADOLIBRE_CLIENT_SECRET || '',
    siteId: (c as any).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
  });

  try {
    const refreshed = await mlService.refreshAccessToken();
    const updatedCreds = { ...c, accessToken: refreshed.accessToken };
    const env = (creds as any).environment || 'production';
    await CredentialsManager.saveCredentials(userId, 'mercadolibre', updatedCreds, env);
    clearCredentialsCache(userId, 'mercadolibre', env);
    console.log('Token ML refrescado correctamente.');
  } catch (e: any) {
    console.error('Error al refrescar token:', e?.message || e);
    if (/invalid_grant|expired|revoked/.test(String(e?.message || ''))) {
      console.error('El refresh_token expiró o fue revocado. Reconecta ML desde la app.');
    }
    process.exit(1);
  }

  const token = (await ms.getCredentials(userId, 'mercadolibre'))?.credentials as { accessToken: string; userId: string };
  const resp = await axios.get(
    `https://api.mercadolibre.com/users/${token.userId}/items/search`,
    { params: { limit: 1, offset: 0 }, headers: { Authorization: `Bearer ${token.accessToken}` } }
  );
  const total = resp.data?.paging?.total ?? 'N/A';
  console.log('Publicaciones según API de ML:', total);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e?.response?.data || e?.message || e);
  process.exit(1);
});
