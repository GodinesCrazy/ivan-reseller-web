/**
 * Script para probar la integración de MercadoLibre:
 * 1. Verifica que la API de MercadoLibre esté operativa (checkMercadoLibreAPI)
 * 2. Si está OK, busca un producto publicable y ejecuta publishProduct
 *
 * Uso:
 *   cd backend && npx tsx scripts/test-mercadolibre-publish.ts [userId] [productId]
 *
 * Ejemplo:
 *   cd backend && npx tsx scripts/test-mercadolibre-publish.ts 1
 *   cd backend && npx tsx scripts/test-mercadolibre-publish.ts 1 123
 */

import 'dotenv/config';
import { APIAvailabilityService } from '../src/services/api-availability.service';
import { MarketplaceService } from '../src/services/marketplace.service';
import { prisma } from '../src/config/database';

async function main() {
  const userId = parseInt(process.argv[2] || '1', 10);
  const productIdArg = process.argv[3];

  console.log('\n🧪 Test MercadoLibre API y publicación\n');
  console.log(`Usuario: ${userId}`);
  if (productIdArg) console.log(`Producto (especificado): ${productIdArg}`);

  const apiAvailability = new APIAvailabilityService();
  const marketplaceService = new MarketplaceService();

  // 1. Verificar API MercadoLibre
  console.log('\n📋 Paso 1: Verificando API MercadoLibre...');
  const status = await apiAvailability.checkMercadoLibreAPI(userId, 'production');

  if (!status.isAvailable && status.status !== 'healthy') {
    console.error('\n❌ API MercadoLibre no está operativa:', status.error || status.message);
    if (status.missingFields?.length) {
      console.error('   Campos faltantes:', status.missingFields.join(', '));
    }
    process.exit(1);
  }

  console.log('   ✅ API MercadoLibre operativa');

  // 2. Buscar producto para publicar (o usar el especificado)
  let productId: number;

  if (productIdArg) {
    productId = parseInt(productIdArg, 10);
    const product = await prisma.product.findFirst({
      where: { id: productId, userId },
    });
    if (!product) {
      console.error(`\n❌ Producto ${productId} no encontrado o no pertenece al usuario ${userId}`);
      process.exit(1);
    }
    const images = JSON.parse(product.images || '[]') as string[];
    if (!images?.length) {
      console.error(`\n❌ El producto ${productId} no tiene imágenes`);
      process.exit(1);
    }
    console.log(`\n📋 Paso 2: Usando producto ${productId}: ${product.title?.substring(0, 50)}...`);
  } else {
    const products = await prisma.product.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    const product = products.find((p) => {
      const imgs = JSON.parse(p.images || '[]') as string[];
      return imgs?.length > 0;
    });

    if (!product) {
      console.error('\n❌ No se encontró ningún producto PENDING/APPROVED con imágenes.');
      console.error('   Crea un producto o especifica uno: npx tsx scripts/test-mercadolibre-publish.ts 1 <productId>');
      process.exit(1);
    }

    productId = product.id;
    console.log(`\n📋 Paso 2: Producto encontrado: ${productId} - ${product.title?.substring(0, 50)}...`);
  }

  // 3. Publicar
  console.log('\n📋 Paso 3: Publicando en MercadoLibre...');

  try {
    const result = await marketplaceService.publishProduct(
      userId,
      {
        productId,
        marketplace: 'mercadolibre',
      },
      'production'
    );

    if (result.success) {
      console.log('\n✅ Publicación exitosa');
      console.log(`   Listing ID: ${result.listingId}`);
      if (result.listingUrl) console.log(`   URL: ${result.listingUrl}`);
    } else {
      console.error('\n❌ Publicación fallida:', result.error);
      process.exit(1);
    }
  } catch (err: any) {
    console.error('\n❌ Error durante la publicación:', err.message);
    process.exit(1);
  }
}

main();
