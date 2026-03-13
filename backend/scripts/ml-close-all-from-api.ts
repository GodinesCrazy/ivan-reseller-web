#!/usr/bin/env tsx
/**
 * Cierra TODAS las publicaciones de Mercado Libre del usuario, obteniéndolas desde la API de ML.
 * Incluye publicaciones que no están en nuestra BD (manuales, de otro origen, pérdida de sync).
 * Después sincroniza la BD: elimina listings y pone productos a APPROVED.
 *
 * Uso:
 *   cd backend && npx tsx scripts/ml-close-all-from-api.ts <userId>
 * userId es obligatorio (el usuario debe tener credenciales ML configuradas).
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const userIdArg = process.argv[2];
  if (!userIdArg) {
    console.error('Uso: npx tsx scripts/ml-close-all-from-api.ts <userId>');
    process.exit(1);
  }
  const userId = parseInt(userIdArg, 10);
  if (isNaN(userId)) {
    console.error('userId debe ser un número');
    process.exit(1);
  }

  const { MarketplaceService } = await import('../src/services/marketplace.service');

  console.log('\n[ML-CLOSE-ALL-FROM-API] Cerrar TODAS las publicaciones ML (obtenidas desde API de ML)\n');
  console.log(`Usuario: ${userId}\n`);

  const marketplaceService = new MarketplaceService();
  try {
    const result = await marketplaceService.mlCloseAllFromApi(userId);
    console.log('Resultado:');
    console.log(`  Cerrados en ML: ${result.closed}`);
    console.log(`  Fallidos: ${result.failed}`);
    console.log(`  Eliminados de BD: ${result.deletedFromDb}`);
    console.log(`  Productos actualizados a APPROVED: ${result.productIdsUpdated.length}`);
    if (result.errors.length > 0) {
      console.log('\nErrores:');
      result.errors.slice(0, 10).forEach((e) => console.log(`  - ${e.listingId}: ${e.error}`));
      if (result.errors.length > 10) console.log(`  ... y ${result.errors.length - 10} más`);
    }
    console.log('\n[ML-CLOSE-ALL-FROM-API] Listo.\n');
    process.exit(result.failed > 0 && result.closed === 0 ? 1 : 0);
  } catch (err: any) {
    console.error('Error:', err?.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
