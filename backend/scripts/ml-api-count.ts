/**
 * Obtiene el total de publicaciones que la API de Mercado Libre reporta para el usuario.
 * Uso: npx tsx scripts/ml-api-count.ts [userId]
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import { prisma } from '../src/config/database';
import axios from 'axios';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
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
      userId = row.userId;
    }
  }
  if (!userId) {
    console.error('No hay usuario con credenciales/listings ML. Indica userId: npx tsx scripts/ml-api-count.ts <userId>');
    process.exit(1);
  }

  const { MarketplaceService } = await import('../src/services/marketplace.service');
  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(userId, 'mercadolibre');
  if (!creds?.isActive || !creds.credentials) {
    console.error('Usuario sin credenciales ML activas');
    process.exit(1);
  }

  const c = creds.credentials as { accessToken: string; userId: string };
  const mlUserId = c.userId;
  const token = c.accessToken;
  if (!mlUserId || !token) {
    console.error('Credenciales ML incompletas (userId o accessToken)');
    process.exit(1);
  }

  const resp = await axios.get(
    `https://api.mercadolibre.com/users/${mlUserId}/items/search`,
    { params: { limit: 1, offset: 0 }, headers: { Authorization: `Bearer ${token}` } }
  );
  const total = resp.data?.paging?.total ?? 'N/A';
  console.log(total);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e?.response?.data || e?.message || e);
  process.exit(1);
});
