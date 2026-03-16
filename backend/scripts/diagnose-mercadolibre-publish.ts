#!/usr/bin/env tsx
/**
 * Diagnóstico de publicación en MercadoLibre.
 * Verifica credenciales, producto y compliance básico antes de publicar.
 * Opcional: --publish intenta publicar en sandbox.
 *
 * Uso:
 *   cd backend && npx tsx scripts/diagnose-mercadolibre-publish.ts [userId] [productId] [--publish]
 *
 * Ejemplo:
 *   npx tsx scripts/diagnose-mercadolibre-publish.ts 1 123
 *   npx tsx scripts/diagnose-mercadolibre-publish.ts 1 123 --publish
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const userId = parseInt(args[0] || '1', 10) || 1;
  const productIdArg = args[1];
  const doPublish = process.argv.includes('--publish');

  console.log('\n=== Diagnóstico MercadoLibre Publish ===\n');
  console.log('UserId:', userId);
  if (productIdArg) console.log('ProductId:', productIdArg);
  if (doPublish) console.log('Modo: --publish (intentará publicar en sandbox)\n');
  else console.log('Modo: solo validación (sin publicar)\n');

  const { prisma } = await import('../src/config/database');
  const { MarketplaceService } = await import('../src/services/marketplace.service');
  const { workflowConfigService } = await import('../src/services/workflow-config.service');
  const { checkMLCompliance } = await import('../src/services/mercadolibre.service');

  const marketplaceService = new MarketplaceService();
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Credenciales
  console.log('1. Credenciales MercadoLibre');
  const env = (await workflowConfigService.getUserEnvironment(userId)) || 'production';
  console.log('   Environment:', env);
  const creds = await marketplaceService.getCredentials(userId, 'mercadolibre', env);
  if (!creds || !creds.isActive) {
    errors.push('Credenciales MercadoLibre no configuradas o inactivas.');
    console.log('   ❌ No configuradas o inactivas');
  } else {
    if (creds.issues?.length) {
      errors.push(`Credenciales con problemas: ${creds.issues.join(', ')}`);
      console.log('   ❌ Issues:', creds.issues.join(', '));
    } else {
      console.log('   ✅ OK');
    }
    if (creds.warnings?.length) {
      warnings.push(...creds.warnings);
    }
  }

  // 2. Producto
  let productId: number;
  let product: { id: number; title: string | null; description: string | null; status: string; aliexpressPrice: number | null; images: string | null; productData: string | null } | null = null;

  if (productIdArg) {
    productId = parseInt(productIdArg, 10);
    product = await prisma.product.findFirst({
      where: { id: productId, userId },
      select: { id: true, title: true, description: true, status: true, aliexpressPrice: true, images: true, productData: true },
    });
    if (!product) {
      errors.push(`Producto ${productId} no encontrado o no pertenece al usuario ${userId}.`);
      console.log('\n2. Producto');
      console.log('   ❌ No encontrado');
    }
  } else {
    // Buscar un producto apropiado
    product = await prisma.product.findFirst({
      where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, description: true, status: true, aliexpressPrice: true, images: true, productData: true },
    });
    if (!product) {
      errors.push('No hay productos PENDING/APPROVED. Especifica productId: npx tsx scripts/diagnose-mercadolibre-publish.ts 1 <productId>');
      console.log('\n2. Producto');
      console.log('   ❌ No hay productos disponibles');
    }
    productId = product?.id ?? 0;
  }

  if (product) {
    console.log('\n2. Producto', productId);
    if (!product.title || !product.aliexpressPrice || product.aliexpressPrice <= 0) {
      errors.push('Producto sin title o aliexpressPrice inválido.');
      console.log('   ❌ Falta title o precio');
    } else {
      console.log('   Title:', product.title?.substring(0, 60) + (product.title && product.title.length > 60 ? '...' : ''));
      console.log('   Precio AliExpress:', product.aliexpressPrice);
    }
    if (product.status !== 'APPROVED' && product.status !== 'PENDING') {
      errors.push(`Producto debe estar APPROVED o PENDING, tiene: ${product.status}`);
      console.log('   ❌ Status:', product.status);
    } else {
      console.log('   Status:', product.status);
    }

    const images = (() => {
      try {
        return JSON.parse(product.images || '[]') as string[];
      } catch {
        return [];
      }
    })();
    if (!images?.length) {
      errors.push('Producto sin imágenes.');
      console.log('   ❌ Sin imágenes');
    } else {
      console.log('   Imágenes:', images.length);
      // Check image size (quick HEAD/fetch would be heavy; we note it as advisory)
      warnings.push('Compliance: ML exige mínimo 15KB por imagen. Verifica calidad de imágenes.');
    }

    // 3. Compliance básico (título/descripción)
    console.log('\n3. Compliance PI (título/descripción)');
    const title = product.title || '';
    const desc = product.description || '';
    const compliance = checkMLCompliance(title, desc);
    if (!compliance.compliant) {
      errors.push(`Violaciones PI: ${compliance.violations.join(', ')}`);
      console.log('   ❌ Violaciones:', compliance.violations.join(', '));
    } else {
      console.log('   ✅ Sin violaciones detectadas');
    }
  }

  // Resumen
  console.log('\n--- Resumen ---');
  if (errors.length > 0) {
    console.log('Errores:');
    errors.forEach((e) => console.log('  -', e));
  }
  if (warnings.length > 0) {
    console.log('Advertencias:');
    warnings.forEach((w) => console.log('  -', w));
  }

  if (errors.length > 0) {
    console.log('\n❌ Diagnóstico fallido. Corrige los errores antes de publicar.\n');
    process.exit(1);
  }

  if (doPublish && productId) {
    console.log('\n4. Intentando publicación en MercadoLibre (environment:', env, ')');
    try {
      const result = await marketplaceService.publishProduct(
        userId,
        { productId, marketplace: 'mercadolibre' },
        env
      );
      if (result.success) {
        console.log('   ✅ Publicación exitosa');
        if (result.listingUrl) console.log('   URL:', result.listingUrl);
      } else {
        console.log('   ❌ Falló:', result.error);
        process.exit(1);
      }
    } catch (err: any) {
      console.log('   ❌ Error:', err?.message || err);
      process.exit(1);
    }
  } else {
    console.log('\n✅ Pre-requisitos OK. Para publicar: añade --publish al comando.\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
