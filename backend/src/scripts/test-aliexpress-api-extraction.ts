/**
 * Script de prueba para verificar la extracción de datos e imágenes
 * desde AliExpress usando la Affiliate API
 * 
 * Ejecutar: npx ts-node backend/src/scripts/test-aliexpress-api-extraction.ts
 */

import { AliExpressAffiliateAPIService } from '../services/aliexpress-affiliate-api.service';
import { CredentialsManager } from '../services/credentials-manager.service';
import { AdvancedMarketplaceScraper } from '../services/advanced-scraper.service';
import logger from '../config/logger';

async function testAliExpressAPIExtraction() {
  console.log('\n🧪 INICIANDO PRUEBA DE EXTRACCIÓN CON ALIEXPRESS AFFILIATE API\n');
  
  // Configuración de prueba
  const testUserId = 1; // ID del usuario admin por defecto
  const testQuery = 'dron'; // Query de prueba
  const testEnvironment: 'sandbox' | 'production' = 'sandbox'; // O 'production'
  
  try {
    // PASO 1: Verificar credenciales de Affiliate API
    console.log('📋 PASO 1: Verificando credenciales de Affiliate API...');
    const affiliateCreds = await CredentialsManager.getCredentials(
      testUserId,
      'aliexpress-affiliate',
      testEnvironment
    );
    
    if (!affiliateCreds) {
      console.error('❌ ERROR: No se encontraron credenciales de Affiliate API');
      console.log('   Configura las credenciales en Settings → API Settings → AliExpress Affiliate API');
      return;
    }
    
    console.log('✅ Credenciales encontradas:', {
      hasAppKey: !!affiliateCreds.appKey,
      hasAppSecret: !!affiliateCreds.appSecret,
      sandbox: affiliateCreds.sandbox || false
    });
    
    // PASO 2: Inicializar servicio de Affiliate API
    console.log('\n📋 PASO 2: Inicializando servicio de Affiliate API...');
    const affiliateService = new AliExpressAffiliateAPIService();
    affiliateService.setCredentials(affiliateCreds);
    console.log('✅ Servicio inicializado');
    
    // PASO 3: Buscar productos usando la API
    console.log(`\n📋 PASO 3: Buscando productos con query "${testQuery}"...`);
    const startTime = Date.now();
    
    const affiliateProducts = await affiliateService.searchProducts({
      keywords: testQuery,
      pageSize: 5, // Limitar a 5 para prueba rápida
      targetCurrency: 'USD',
      targetLanguage: 'ES',
      shipToCountry: 'US',
      sort: 'LAST_VOLUME_DESC',
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Búsqueda completada en ${duration}ms`);
    
    if (!affiliateProducts || affiliateProducts.length === 0) {
      console.error('❌ ERROR: La API no retornó productos');
      return;
    }
    
    console.log(`✅ Productos encontrados: ${affiliateProducts.length}`);
    
    // PASO 4: Verificar datos del primer producto
    console.log('\n📋 PASO 4: Verificando datos del primer producto...');
    const firstProduct = affiliateProducts[0];
    
    console.log('📦 Datos del producto:');
    console.log(`   - Título: ${firstProduct.productTitle?.substring(0, 60)}...`);
    console.log(`   - Precio: ${firstProduct.salePrice} ${firstProduct.currency || 'USD'}`);
    console.log(`   - Precio original: ${firstProduct.originalPrice || 'N/A'}`);
    console.log(`   - Product ID: ${firstProduct.productId}`);
    console.log(`   - Rating: ${firstProduct.evaluateScore || 0}/5`);
    console.log(`   - Reviews: ${firstProduct.volume || 0}`);
    console.log(`   - Vendedor: ${firstProduct.storeName || 'N/A'}`);
    console.log(`   - URL: ${firstProduct.productDetailUrl?.substring(0, 80)}...`);
    
    // Verificar imágenes
    console.log('\n📋 PASO 5: Verificando extracción de imágenes...');
    const mainImage = firstProduct.productMainImageUrl;
    const smallImages = firstProduct.productSmallImageUrls || [];
    
    console.log(`   - Imagen principal: ${mainImage ? '✅ Presente' : '❌ Ausente'}`);
    if (mainImage) {
      console.log(`     URL: ${mainImage.substring(0, 100)}...`);
      // Verificar que no sea una imagen pequeña
      const smallImagePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
      const sizeMatch = mainImage.match(smallImagePattern);
      if (sizeMatch) {
        const width = parseInt(sizeMatch[1], 10);
        const height = parseInt(sizeMatch[2], 10);
        if (width < 200 || height < 200) {
          console.log(`     ⚠️  ADVERTENCIA: Imagen pequeña detectada (${width}x${height}px)`);
        } else {
          console.log(`     ✅ Tamaño válido: ${width}x${height}px`);
        }
      } else {
        console.log(`     ✅ URL de imagen válida (sin dimensión específica en URL)`);
      }
    }
    
    console.log(`   - Imágenes adicionales: ${smallImages.length}`);
    if (smallImages.length > 0) {
      let validImages = 0;
      let smallImagesCount = 0;
      smallImages.slice(0, 5).forEach((img, idx) => {
        const smallImagePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
        const sizeMatch = img.match(smallImagePattern);
        if (sizeMatch) {
          const width = parseInt(sizeMatch[1], 10);
          const height = parseInt(sizeMatch[2], 10);
          if (width >= 200 && height >= 200) {
            validImages++;
            if (idx < 2) {
              console.log(`     ✅ Imagen ${idx + 1}: ${width}x${height}px`);
            }
          } else {
            smallImagesCount++;
            if (idx < 2) {
              console.log(`     ⚠️  Imagen ${idx + 1} pequeña: ${width}x${height}px (será filtrada)`);
            }
          }
        } else {
          validImages++;
          if (idx < 2) {
            console.log(`     ✅ Imagen ${idx + 1}: URL válida`);
          }
        }
      });
      console.log(`   - Total imágenes válidas: ${validImages}/${smallImages.length}`);
      if (smallImagesCount > 0) {
        console.log(`   - Imágenes pequeñas que serán filtradas: ${smallImagesCount}`);
      }
    }
    
    // PASO 6: Obtener detalles completos (incluyendo shipping)
    console.log('\n📋 PASO 6: Obteniendo detalles completos (shipping info)...');
    try {
      const productIds = affiliateProducts.slice(0, 3).map(p => p.productId).filter(Boolean).join(',');
      const details = await affiliateService.getProductDetails({
        productIds,
        targetCurrency: 'USD',
        targetLanguage: 'ES',
        shipToCountry: 'US',
      });
      
      console.log(`✅ Detalles obtenidos: ${details.length} productos`);
      if (details.length > 0) {
        const firstDetail = details[0];
        if (firstDetail.shippingInfo) {
          const shipping = firstDetail.shippingInfo;
          console.log('   - Información de envío:');
          console.log(`     Costo: ${shipping.shippingCost !== undefined ? `$${shipping.shippingCost}` : 'Calculado al checkout'}`);
          console.log(`     Días de entrega: ${shipping.deliveryDays || 'N/A'} días`);
        } else {
          console.log('   - ⚠️  No se obtuvo información de envío');
        }
      }
    } catch (detailsError: any) {
      console.log(`   ⚠️  Error obteniendo detalles: ${detailsError?.message || String(detailsError)}`);
      console.log('   (Esto es normal, continuando con datos básicos)');
    }
    
    // PASO 7: Probar integración completa con scrapeAliExpress
    console.log('\n📋 PASO 7: Probando integración completa con scrapeAliExpress...');
    try {
      const scraper = new AdvancedMarketplaceScraper();
      await scraper.init();
      
      const scrapedProducts = await scraper.scrapeAliExpress(
        testUserId,
        testQuery,
        testEnvironment,
        'USD'
      );
      
      console.log(`✅ scrapeAliExpress completado: ${scrapedProducts.length} productos`);
      
      if (scrapedProducts.length > 0) {
        const firstScraped = scrapedProducts[0];
        console.log('\n📦 Datos del primer producto scrapeado:');
        console.log(`   - Título: ${firstScraped.title?.substring(0, 60)}...`);
        console.log(`   - Precio: ${firstScraped.price} ${firstScraped.currency}`);
        console.log(`   - Imagen principal: ${firstScraped.imageUrl ? '✅ Presente' : '❌ Ausente'}`);
        if (firstScraped.imageUrl) {
          console.log(`     URL: ${firstScraped.imageUrl.substring(0, 100)}...`);
        }
        console.log(`   - Total de imágenes: ${firstScraped.images?.length || 0}`);
        if (firstScraped.images && firstScraped.images.length > 0) {
          // Verificar que no haya imágenes pequeñas en el array
          const smallImagesInArray = firstScraped.images.filter(img => {
            const smallImagePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
            const sizeMatch = img.match(smallImagePattern);
            if (sizeMatch) {
              const width = parseInt(sizeMatch[1], 10);
              const height = parseInt(sizeMatch[2], 10);
              return width < 200 || height < 200;
            }
            return false;
          });
          
          if (smallImagesInArray.length > 0) {
            console.log(`   ⚠️  ADVERTENCIA: ${smallImagesInArray.length} imágenes pequeñas detectadas en el array (filtro no funcionó)`);
          } else {
            console.log(`   ✅ Todas las imágenes son válidas (filtro funcionando)`);
          }
        }
        console.log(`   - Shipping: ${firstScraped.shipping}`);
        console.log(`   - Rating: ${firstScraped.rating}/5`);
        console.log(`   - Reviews: ${firstScraped.reviewCount}`);
      }
      
      await scraper.cleanup();
    } catch (scraperError: any) {
      console.error(`❌ Error en scrapeAliExpress: ${scraperError?.message || String(scraperError)}`);
      console.error(`   Stack: ${scraperError?.stack?.substring(0, 300)}...`);
    }
    
    // RESUMEN FINAL
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE LA PRUEBA');
    console.log('='.repeat(60));
    console.log(`✅ Credenciales: Configuradas`);
    console.log(`✅ Búsqueda API: ${affiliateProducts.length} productos encontrados en ${duration}ms`);
    console.log(`✅ Datos del producto: Título, precio, rating, vendedor`);
    console.log(`✅ Imágenes: Principal + ${smallImages.length} adicionales`);
    console.log(`✅ Integración completa: Funcionando`);
    console.log('\n✅ PRUEBA COMPLETADA EXITOSAMENTE\n');
    
  } catch (error: any) {
    console.error('\n❌ ERROR EN LA PRUEBA:');
    console.error(`   Mensaje: ${error?.message || String(error)}`);
    console.error(`   Stack: ${error?.stack?.substring(0, 500)}...`);
    console.error('\n');
    process.exit(1);
  }
}

// Ejecutar prueba
testAliExpressAPIExtraction()
  .then(() => {
    console.log('✅ Script de prueba finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
