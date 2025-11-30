/**
 * Script de prueba para verificar extracción de datos e imágenes desde AliExpress Affiliate API
 * Ejecutar: npx tsx backend/src/scripts/test-api-extraction.ts
 */

import { AliExpressAffiliateAPIService } from '../services/aliexpress-affiliate-api.service';
import { CredentialsManager } from '../services/credentials-manager.service';
import { AdvancedMarketplaceScraper } from '../services/advanced-scraper.service';
import logger from '../config/logger';

async function testExtraction() {
  console.log('\n🧪 TESTEANDO EXTRACCIÓN DE DATOS E IMÁGENES DESDE ALIEXPRESS AFFILIATE API\n');
  
  const testUserId = 1;
  const testQuery = 'dron';
  
  try {
    // PASO 1: Verificar credenciales (intentar sandbox primero, luego production)
    console.log('📋 PASO 1: Verificando credenciales...');
    let affiliateCreds;
    let testEnvironment: 'sandbox' | 'production' = 'sandbox';
    
    // Intentar primero con sandbox
    affiliateCreds = await CredentialsManager.getCredentials(
      testUserId,
      'aliexpress-affiliate',
      'sandbox'
    );
    
    if (!affiliateCreds) {
      console.log('   No se encontraron credenciales en sandbox, intentando production...');
      testEnvironment = 'production';
      affiliateCreds = await CredentialsManager.getCredentials(
        testUserId,
        'aliexpress-affiliate',
        'production'
      );
    }
    
    if (!affiliateCreds) {
      console.error('❌ ERROR: No se encontraron credenciales en ningún ambiente');
      console.log('   Configura las credenciales en Settings → API Settings');
      console.log('   Asegúrate de que las credenciales no estén corruptas');
      return;
    }
    
    console.log(`✅ Credenciales encontradas en ambiente: ${testEnvironment}`);
    console.log('✅ Credenciales encontradas');
    console.log(`   Sandbox: ${affiliateCreds.sandbox}`);
    console.log(`   AppKey: ${affiliateCreds.appKey?.substring(0, 10)}...`);
    
    // PASO 2: Probar búsqueda directa
    console.log('\n📋 PASO 2: Probando búsqueda directa con Affiliate API...');
    const affiliateService = new AliExpressAffiliateAPIService();
    affiliateService.setCredentials(affiliateCreds);
    
    const startTime = Date.now();
    let affiliateProducts;
    
    try {
      affiliateProducts = await affiliateService.searchProducts({
        keywords: testQuery,
        pageSize: 3,
        targetCurrency: 'USD',
        targetLanguage: 'ES',
        shipToCountry: 'US',
        sort: 'LAST_VOLUME_DESC',
      });
    } catch (error: any) {
      console.error(`❌ Error en búsqueda: ${error.message}`);
      if (error.message.includes('timeout')) {
        console.log('   ⚠️  La API está tardando mucho. Esto puede ser normal.');
      }
      throw error;
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Búsqueda completada en ${duration}ms`);
    
    if (!affiliateProducts || affiliateProducts.length === 0) {
      console.error('❌ ERROR: La API no retornó productos');
      return;
    }
    
    console.log(`✅ Productos encontrados: ${affiliateProducts.length}`);
    
    // PASO 3: Verificar datos del primer producto
    console.log('\n📋 PASO 3: Verificando datos del primer producto...');
    const firstProduct = affiliateProducts[0];
    
    console.log(`\n📦 PRODUCTO 1:`);
    console.log(`   Título: ${firstProduct.productTitle?.substring(0, 70)}...`);
    console.log(`   Precio: ${firstProduct.salePrice} ${firstProduct.currency}`);
    console.log(`   Precio original: ${firstProduct.originalPrice || 'N/A'}`);
    console.log(`   Product ID: ${firstProduct.productId}`);
    console.log(`   Rating: ${firstProduct.evaluateScore || 0}/5`);
    console.log(`   Reviews: ${firstProduct.volume || 0}`);
    console.log(`   Vendedor: ${firstProduct.storeName || 'N/A'}`);
    console.log(`   URL: ${firstProduct.productDetailUrl?.substring(0, 80)}...`);
    
    // Verificar imágenes
    console.log(`\n📋 PASO 4: Verificando imágenes...`);
    const mainImage = firstProduct.productMainImageUrl;
    const smallImages = firstProduct.productSmallImageUrls || [];
    
    console.log(`   Imagen principal: ${mainImage ? '✅ Presente' : '❌ Ausente'}`);
    if (mainImage) {
      console.log(`     URL: ${mainImage.substring(0, 100)}...`);
      
      // Verificar dimensiones en URL
      const sizePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
      const sizeMatch = mainImage.match(sizePattern);
      if (sizeMatch) {
        const width = parseInt(sizeMatch[1], 10);
        const height = parseInt(sizeMatch[2], 10);
        if (width < 200 || height < 200) {
          console.log(`     ⚠️  Imagen pequeña: ${width}x${height}px (será filtrada)`);
        } else {
          console.log(`     ✅ Tamaño válido: ${width}x${height}px`);
        }
      } else {
        console.log(`     ✅ URL válida (sin dimensión específica)`);
      }
    }
    
    console.log(`   Imágenes adicionales: ${smallImages.length}`);
    if (smallImages.length > 0) {
      let validCount = 0;
      let smallCount = 0;
      
      smallImages.slice(0, 5).forEach((img, idx) => {
        const sizePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
        const sizeMatch = img.match(sizePattern);
        if (sizeMatch) {
          const width = parseInt(sizeMatch[1], 10);
          const height = parseInt(sizeMatch[2], 10);
          if (width >= 200 && height >= 200) {
            validCount++;
            if (idx < 2) {
              console.log(`     ✅ Imagen ${idx + 1}: ${width}x${height}px`);
            }
          } else {
            smallCount++;
            if (idx < 2) {
              console.log(`     ⚠️  Imagen ${idx + 1} pequeña: ${width}x${height}px (será filtrada)`);
            }
          }
        } else {
          validCount++;
          if (idx < 2) {
            console.log(`     ✅ Imagen ${idx + 1}: URL válida`);
          }
        }
      });
      
      console.log(`   ✅ Imágenes válidas: ${validCount}/${smallImages.length}`);
      if (smallCount > 0) {
        console.log(`   ⚠️  Imágenes pequeñas que serán filtradas: ${smallCount}`);
      }
    }
    
    // PASO 5: Probar integración completa con scrapeAliExpress
    console.log(`\n📋 PASO 5: Probando integración completa con scrapeAliExpress...`);
    const scraper = new AdvancedMarketplaceScraper();
    
    try {
      await scraper.init();
      console.log('✅ Navegador inicializado');
      
      const scrapedProducts = await scraper.scrapeAliExpress(
        testUserId,
        testQuery,
        testEnvironment,
        'USD'
      );
      
      console.log(`✅ scrapeAliExpress completado: ${scrapedProducts.length} productos`);
      
      if (scrapedProducts.length > 0) {
        const firstScraped = scrapedProducts[0];
        console.log(`\n📦 PRIMER PRODUCTO SCRAPEADO:`);
        console.log(`   Título: ${firstScraped.title?.substring(0, 70)}...`);
        console.log(`   Precio: ${firstScraped.price} ${firstScraped.currency}`);
        console.log(`   Imagen principal: ${firstScraped.imageUrl ? '✅' : '❌'}`);
        
        if (firstScraped.imageUrl) {
          console.log(`     URL: ${firstScraped.imageUrl.substring(0, 100)}...`);
        }
        
        console.log(`   Total imágenes: ${firstScraped.images?.length || 0}`);
        
        if (firstScraped.images && firstScraped.images.length > 0) {
          console.log(`   ✅ Imágenes extraídas:`);
          firstScraped.images.slice(0, 3).forEach((img, idx) => {
            console.log(`     ${idx + 1}. ${img.substring(0, 80)}...`);
          });
          
          // Verificar que no hay imágenes pequeñas
          const smallImages = firstScraped.images.filter(img => {
            const sizePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
            const sizeMatch = img.match(sizePattern);
            if (sizeMatch) {
              const width = parseInt(sizeMatch[1], 10);
              const height = parseInt(sizeMatch[2], 10);
              return width < 200 || height < 200;
            }
            return false;
          });
          
          if (smallImages.length > 0) {
            console.log(`   ⚠️  ADVERTENCIA: ${smallImages.length} imágenes pequeñas detectadas (filtro no funcionó)`);
          } else {
            console.log(`   ✅ Todas las imágenes son válidas (filtro funcionando)`);
          }
        } else {
          console.log(`   ❌ ERROR: No se extrajeron imágenes`);
        }
        
        console.log(`   Shipping: ${firstScraped.shipping}`);
        console.log(`   Rating: ${firstScraped.rating}/5`);
        console.log(`   Reviews: ${firstScraped.reviewCount}`);
        console.log(`   Vendedor: ${firstScraped.seller}`);
      }
      
      await scraper.cleanup();
    } catch (scraperError: any) {
      console.error(`❌ Error en scrapeAliExpress: ${scraperError.message}`);
      if (scraperError.stack) {
        console.error(`   Stack: ${scraperError.stack.substring(0, 300)}...`);
      }
    }
    
    // RESUMEN
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESUMEN DE LA PRUEBA');
    console.log('='.repeat(70));
    console.log(`✅ Credenciales: Configuradas`);
    console.log(`✅ Búsqueda API: ${affiliateProducts.length} productos en ${duration}ms`);
    console.log(`✅ Datos del producto: Título, precio, rating, vendedor`);
    
    if (firstProduct.productMainImageUrl) {
      console.log(`✅ Imagen principal: Presente`);
    } else {
      console.log(`❌ Imagen principal: Ausente`);
    }
    
    if (smallImages.length > 0) {
      console.log(`✅ Imágenes adicionales: ${smallImages.length} encontradas`);
    } else {
      console.log(`⚠️  Imágenes adicionales: No encontradas`);
    }
    
    if (scrapedProducts && scrapedProducts.length > 0 && scrapedProducts[0].images && scrapedProducts[0].images.length > 0) {
      console.log(`✅ Integración completa: ${scrapedProducts[0].images.length} imágenes extraídas`);
      console.log('✅ EXTRACCIÓN FUNCIONANDO CORRECTAMENTE');
    } else {
      console.log(`❌ Integración completa: No se extrajeron imágenes`);
      console.log('⚠️  VERIFICAR: La API puede estar haciendo timeout o las imágenes no se están mapeando correctamente');
    }
    
    console.log('\n');
    
  } catch (error: any) {
    console.error('\n❌ ERROR EN LA PRUEBA:');
    console.error(`   Mensaje: ${error?.message || String(error)}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack.substring(0, 500)}...`);
    }
    process.exit(1);
  }
}

testExtraction()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });

