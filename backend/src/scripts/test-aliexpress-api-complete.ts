/**
 * Script de prueba completo para AliExpress Affiliate API
 * 
 * Prueba:
 * 1. Búsqueda de productos
 * 2. Extracción de imágenes
 * 3. Extracción de precios y datos
 * 4. Verificación de filtrado de imágenes
 * 5. Detalles de envío
 */

import { AliExpressAffiliateAPIService } from '../services/aliexpress-affiliate-api.service';
import { CredentialsManager } from '../services/credentials-manager.service';
import logger from '../config/logger';

async function testAliExpressAPI() {
  console.log('\n🧪 INICIANDO PRUEBA DE ALIEXPRESS AFFILIATE API\n');
  console.log('='.repeat(80));

  const testUserId = 1; // ID del usuario de prueba
  const testQuery = 'smartwatch'; // Query de prueba
  const testEnvironments: Array<'sandbox' | 'production'> = ['sandbox', 'production'];

  for (const environment of testEnvironments) {
    console.log(`\n📋 PROBANDO AMBIENTE: ${environment.toUpperCase()}\n`);
    console.log('-'.repeat(80));

    try {
      // 1. Intentar obtener credenciales
      console.log(`\n1️⃣ Buscando credenciales para usuario ${testUserId} en ambiente ${environment}...`);
      const credentials = await CredentialsManager.getCredentials(
        testUserId,
        'aliexpress-affiliate',
        environment
      );

      if (!credentials) {
        console.log(`   ❌ No se encontraron credenciales en ${environment}`);
        console.log(`   💡 Solución: Configura las credenciales en API Settings`);
        continue;
      }

      console.log(`   ✅ Credenciales encontradas:`);
      console.log(`      - appKey: ${credentials.appKey?.substring(0, 10)}...`);
      console.log(`      - appSecret: ${credentials.appSecret ? '✓ Configurado' : '✗ No configurado'}`);
      console.log(`      - trackingId: ${credentials.trackingId || 'No configurado'}`);
      console.log(`      - sandbox: ${credentials.sandbox}`);

      // Validar que las credenciales tengan los campos requeridos
      if (!credentials.appKey || !credentials.appSecret) {
        console.log(`   ❌ Credenciales incompletas: faltan appKey o appSecret`);
        continue;
      }

      // 2. Inicializar servicio
      console.log(`\n2️⃣ Inicializando AliExpress Affiliate API Service...`);
      const apiService = new AliExpressAffiliateAPIService();
      apiService.setCredentials(credentials);
      console.log(`   ✅ Servicio inicializado`);

      // 3. Buscar productos
      console.log(`\n3️⃣ Buscando productos con query: "${testQuery}"...`);
      const searchStartTime = Date.now();
      
      try {
        const products = await apiService.searchProducts({
          keywords: testQuery,
          pageSize: 5, // Solo 5 productos para prueba rápida
          targetCurrency: 'USD',
          targetLanguage: 'ES',
          shipToCountry: 'CL',
          sort: 'LAST_VOLUME_DESC',
        });

        const searchDuration = Date.now() - searchStartTime;
        
        if (!products || products.length === 0) {
          console.log(`   ⚠️  La API retornó 0 productos`);
          console.log(`   💡 Posibles causas:`);
          console.log(`      - La query no tiene resultados`);
          console.log(`      - Problemas con la API`);
          continue;
        }

        console.log(`   ✅ Productos encontrados: ${products.length} (${searchDuration}ms)`);

        // 4. Analizar cada producto
        console.log(`\n4️⃣ Analizando productos extraídos:\n`);
        
        for (let i = 0; i < Math.min(products.length, 3); i++) {
          const product = products[i];
          console.log(`   📦 Producto #${i + 1}:`);
          console.log(`      - ID: ${product.productId}`);
          console.log(`      - Título: ${product.productTitle?.substring(0, 60)}...`);
          console.log(`      - Precio: ${product.salePrice} ${product.currency || 'USD'}`);
          console.log(`      - Precio original: ${product.originalPrice} ${product.currency || 'USD'}`);
          console.log(`      - Descuento: ${product.discount || 0}%`);
          console.log(`      - Rating: ${product.evaluateScore || 'N/A'}`);
          console.log(`      - Ventas: ${product.volume || 0}`);
          console.log(`      - Tienda: ${product.storeName || 'N/A'}`);
          
          // Analizar imágenes
          console.log(`      - Imagen principal: ${product.productMainImageUrl ? '✓' : '✗'}`);
          if (product.productMainImageUrl) {
            console.log(`        URL: ${product.productMainImageUrl.substring(0, 80)}...`);
            
            // Verificar si es una imagen grande (no thumbnail)
            const sizePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
            const sizeMatch = product.productMainImageUrl.match(sizePattern);
            if (sizeMatch) {
              const width = parseInt(sizeMatch[1], 10);
              const height = parseInt(sizeMatch[2], 10);
              console.log(`        Dimensiones detectadas: ${width}x${height}`);
              if (width >= 200 && height >= 200) {
                console.log(`        ✅ Imagen de tamaño adecuado (≥200px)`);
              } else {
                console.log(`        ⚠️  Imagen pequeña (será filtrada)`);
              }
            } else {
              console.log(`        ℹ️  No se detectaron dimensiones en URL (probablemente OK)`);
            }
          }
          
          console.log(`      - Imágenes pequeñas: ${product.productSmallImageUrls?.length || 0}`);
          
          // Filtrar imágenes pequeñas como lo hace el sistema
          const allRawImages = Array.from(new Set([
            product.productMainImageUrl,
            ...(product.productSmallImageUrls || [])
          ].filter(Boolean))) as string[];
          
          const filteredImages = allRawImages.filter(imgUrl => {
            if (!imgUrl) return false;
            
            // Patrón 1: Detectar dimensiones en URL
            const sizePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
            const sizeMatch = imgUrl.match(sizePattern);
            if (sizeMatch) {
              const width = parseInt(sizeMatch[1], 10);
              const height = parseInt(sizeMatch[2], 10);
              if (width < 200 || height < 200) {
                return false; // Filtrar imagen pequeña
              }
              return true;
            }
            
            // Patrón 2: Detectar URLs de thumbnails
            const thumbnailPatterns = [
              /\/50x50/i, /\/100x100/i, /\/150x150/i, /thumbnail/i, /thumb/i, /_50x50/i, /_100x100/i,
            ];
            if (thumbnailPatterns.some(pattern => pattern.test(imgUrl))) {
              return false; // Filtrar thumbnail
            }
            
            return true; // Mantener imagen
          });
          
          console.log(`      - Imágenes totales (raw): ${allRawImages.length}`);
          console.log(`      - Imágenes filtradas (≥200px): ${filteredImages.length}`);
          console.log(`      - Imágenes descartadas: ${allRawImages.length - filteredImages.length}`);
          
          if (filteredImages.length > 0) {
            console.log(`      ✅ Primeras imágenes válidas:`);
            filteredImages.slice(0, 3).forEach((img, idx) => {
              console.log(`         ${idx + 1}. ${img.substring(0, 80)}...`);
            });
          } else {
            console.log(`      ⚠️  No hay imágenes válidas después del filtrado`);
          }
          
          console.log(''); // Línea en blanco entre productos
        }

        // 5. Obtener detalles de envío para algunos productos
        console.log(`\n5️⃣ Obteniendo detalles de envío...`);
        const productIds = products.slice(0, 3).map(p => p.productId).filter(Boolean).join(',');
        
        if (productIds) {
          try {
            const detailsStartTime = Date.now();
            const details = await apiService.getProductDetails({
              productIds,
              targetCurrency: 'USD',
              targetLanguage: 'ES',
              shipToCountry: 'CL',
            });
            const detailsDuration = Date.now() - detailsStartTime;
            
            console.log(`   ✅ Detalles obtenidos: ${details.length} productos (${detailsDuration}ms)`);
            
            details.forEach((detail, idx) => {
              console.log(`\n   📦 Detalles del producto #${idx + 1}:`);
              if (detail.shippingInfo) {
                const shipping = detail.shippingInfo;
                console.log(`      - Costo de envío: ${shipping.shippingCost !== undefined ? `${shipping.shippingCost} USD` : 'N/A'}`);
                console.log(`      - Días de entrega: ${shipping.deliveryDays || 'N/A'}`);
                console.log(`      - País de envío: ${shipping.shipToCountry || 'CL'}`);
              } else {
                console.log(`      ⚠️  No hay información de envío disponible`);
              }
            });
          } catch (detailsError: any) {
            console.log(`   ⚠️  Error obteniendo detalles de envío: ${detailsError?.message || String(detailsError)}`);
            console.log(`   ℹ️  Esto no es crítico, el sistema continuará sin shipping info`);
          }
        }

        // Resumen final
        console.log(`\n${'='.repeat(80)}`);
        console.log(`\n✅ PRUEBA EXITOSA EN AMBIENTE: ${environment.toUpperCase()}\n`);
        console.log(`📊 RESUMEN:`);
        console.log(`   - Productos encontrados: ${products.length}`);
        console.log(`   - Tiempo de búsqueda: ${searchDuration}ms`);
        console.log(`   - Imágenes extraídas: ${products.reduce((acc, p) => {
          const allImgs = [
            p.productMainImageUrl,
            ...(p.productSmallImageUrls || [])
          ].filter(Boolean);
          return acc + allImgs.length;
        }, 0)}`);
        console.log(`   - Status: ✅ API funcionando correctamente`);
        
        // Si llegamos aquí en el primer ambiente, no necesitamos probar el segundo
        if (products.length > 0) {
          console.log(`\n💡 El sistema está configurado correctamente y puede usar la API oficial de AliExpress\n`);
          break; // Salir del loop si encontramos credenciales y productos
        }
        
      } catch (apiError: any) {
        const errorMessage = apiError?.message || String(apiError);
        const searchDuration = Date.now() - searchStartTime;
        
        console.log(`   ❌ Error en llamada a API (${searchDuration}ms):`);
        console.log(`      Error: ${errorMessage}`);
        
        if (errorMessage.includes('timeout')) {
          console.log(`\n   ⚠️  TIMEOUT: La API no respondió a tiempo`);
          console.log(`   💡 Posibles soluciones:`);
          console.log(`      - Verificar conectividad con AliExpress`);
          console.log(`      - Revisar credenciales`);
          console.log(`      - La API puede estar temporalmente inaccesible`);
        } else if (errorMessage.includes('credentials') || errorMessage.includes('unauthorized')) {
          console.log(`\n   ⚠️  ERROR DE AUTENTICACIÓN`);
          console.log(`   💡 Soluciones:`);
          console.log(`      - Verificar que appKey y appSecret sean correctos`);
          console.log(`      - Revisar que las credenciales estén activas en AliExpress Open Platform`);
        } else {
          console.log(`\n   ⚠️  ERROR DESCONOCIDO`);
          console.log(`   💡 Revisar logs para más detalles`);
        }
      }
      
    } catch (error: any) {
      console.log(`\n   ❌ Error general: ${error?.message || String(error)}`);
      logger.error('Error en prueba de AliExpress API', {
        environment,
        error: error?.message || String(error),
        stack: error?.stack
      });
    }
  }

  console.log(`\n${'='.repeat(80)}\n`);
  console.log(`🏁 PRUEBA COMPLETADA\n`);
}

// Ejecutar prueba
testAliExpressAPI()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    logger.error('Error fatal en script de prueba', {
      error: error?.message || String(error),
      stack: error?.stack
    });
    process.exit(1);
  });

