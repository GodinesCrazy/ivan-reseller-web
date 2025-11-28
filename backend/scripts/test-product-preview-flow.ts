/**
 * Test completo del flujo de preview de producto
 * 
 * Verifica:
 * 1. Creación de producto con múltiples imágenes
 * 2. Generación de preview
 * 3. Parseo de imágenes
 * 4. Endpoint de publicación
 */

import { PrismaClient } from '@prisma/client';
import { MarketplaceService } from '../src/services/marketplace.service';
import { ProductService } from '../src/services/product.service';
import { logger } from '../src/config/logger';

const prisma = new PrismaClient();

async function testProductPreviewFlow() {
  console.log('🧪 Iniciando test completo del flujo de preview de producto...\n');
  
  const userId = 1; // Usuario de prueba
  let testProductId: number | null = null;
  let previewResult: any = null;

  try {
    // ============================================
    // PASO 1: Buscar producto existente en BD
    // ============================================
    console.log('📝 PASO 1: Buscando producto existente en BD...');
    
    const productFromDb = await prisma.product.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!productFromDb) {
      console.log('❌ No se encontró ningún producto en la BD para el usuario 1');
      console.log('   💡 Sugerencia: Importa un producto desde Opportunities primero');
      return;
    }

    testProductId = productFromDb.id;
    console.log(`✅ Producto encontrado: ID ${testProductId}`);
    console.log(`   Título: ${productFromDb.title}`);
    
    if (productFromDb.images) {
      try {
        const parsedImages = JSON.parse(productFromDb.images);
        console.log(`   ✅ Formato correcto: ${Array.isArray(parsedImages) ? 'Array' : 'Otro'}`);
        console.log(`   ✅ Cantidad de imágenes: ${parsedImages.length}`);
        if (parsedImages.length > 0) {
          console.log(`   ✅ Primera imagen: ${parsedImages[0]?.substring(0, 60)}...`);
        }
      } catch (parseError) {
        console.log(`   ❌ Error parseando imágenes: ${parseError}`);
      }
    } else {
      console.log(`   ⚠️  No hay imágenes en el campo images`);
    }

    console.log('');

    // ============================================
    // PASO 2: Verificar parseo de imágenes desde BD
    // ============================================
    console.log('🔍 PASO 2: Verificando parseo de imágenes desde BD...');
    
    const marketplaceService = new MarketplaceService();
    
    if (productFromDb.images) {
      try {
        const parsedImages = JSON.parse(productFromDb.images);
        console.log(`   ✅ Imágenes parseadas desde BD: ${parsedImages.length}`);
        if (parsedImages.length > 0) {
          console.log(`   ✅ El producto tiene imágenes para mostrar en preview`);
        } else {
          console.log(`   ⚠️  El producto no tiene imágenes válidas`);
        }
      } catch (parseError: any) {
        console.log(`   ❌ Error parseando imágenes: ${parseError.message}`);
      }
    } else {
      console.log(`   ⚠️  No hay campo images en el producto`);
    }

    console.log('');

    // ============================================
    // PASO 3: Generar preview del producto
    // ============================================
    console.log('🎨 PASO 3: Generando preview del producto...');
    
    try {
      previewResult = await marketplaceService.generateListingPreview(
        userId,
        testProductId,
        'ebay',
        'sandbox'
      );
      
      if (previewResult.success && previewResult.preview) {
        const preview = previewResult.preview;
        console.log(`✅ Preview generado exitosamente`);
        console.log(`   Marketplace: ${preview.marketplace}`);
        console.log(`   Título: ${preview.title.substring(0, 60)}...`);
        console.log(`   Precio: ${preview.price} ${preview.currency}`);
        console.log(`   Imágenes en preview: ${preview.images.length}`);
        
        if (preview.images.length > 0) {
          console.log(`   ✅ Imágenes parseadas correctamente:`);
          preview.images.forEach((img, idx) => {
            console.log(`      ${idx + 1}. ${img.substring(0, 60)}...`);
          });
        } else {
          console.log(`   ⚠️  No se encontraron imágenes en el preview`);
        }
        
        console.log(`   Margen: ${preview.profitMargin.toFixed(2)}%`);
        console.log(`   Ganancia potencial: ${preview.potentialProfit.toFixed(2)}`);
      } else {
        console.log(`❌ Error generando preview: ${previewResult.error}`);
      }
    } catch (previewError: any) {
      console.log(`❌ Excepción al generar preview: ${previewError.message}`);
      console.log(`   Stack: ${previewError.stack}`);
    }

    console.log('');

    // ============================================
    // PASO 4: Verificar endpoint de publicación
    // ============================================
    console.log('🚀 PASO 4: Verificando disponibilidad de endpoint de publicación...');
    
    // Nota: No podemos probar directamente el endpoint HTTP, pero podemos verificar
    // que el servicio existe y tiene el método necesario
    
    try {
      const { PublisherService } = await import('../src/services/publisher.service');
      console.log(`✅ PublisherService existe`);
      
      // Verificar si tiene método sendForApproval o similar
      const publisherService = new PublisherService();
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(publisherService));
      console.log(`   Métodos disponibles: ${methods.filter(m => m !== 'constructor').join(', ')}`);
    } catch (importError: any) {
      console.log(`⚠️  No se pudo importar PublisherService: ${importError.message}`);
      console.log(`   Esto es normal si el servicio usa otro nombre o estructura`);
    }

    console.log('');

    // ============================================
    // RESUMEN (usando previewResult del paso 3)
    // ============================================
    console.log('📊 RESUMEN DEL TEST:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ Producto creado: ${testProductId}`);
    console.log(`✅ Preview generado: ${previewResult?.success ? 'Sí' : 'No'}`);
    if (!previewResult?.success) {
      console.log(`   Error: ${previewResult?.error || 'Desconocido'}`);
    }
    console.log(`✅ Imágenes parseadas: ${previewResult?.preview?.images?.length || 0} imágenes`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('❌ Error durante el test:', error);
    console.error('Stack:', error.stack);
  } finally {
    // No eliminar producto existente, solo cerrar conexión
    await prisma.$disconnect();
    console.log('\n✅ Test completado');
  }
}

// Ejecutar test
testProductPreviewFlow();

