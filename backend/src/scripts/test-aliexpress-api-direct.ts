/**
 * Script de prueba directo para AliExpress Affiliate API
 * 
 * Prueba la API directamente usando credenciales desde variables de entorno
 * o desde argumentos de línea de comandos
 * 
 * Uso:
 *   npx tsx src/scripts/test-aliexpress-api-direct.ts [appKey] [appSecret] [sandbox]
 */

import { AliExpressAffiliateAPIService } from '../services/aliexpress-affiliate-api.service';
import logger from '../config/logger';

async function testAliExpressAPIDirect() {
  console.log('\n🧪 INICIANDO PRUEBA DIRECTA DE ALIEXPRESS AFFILIATE API\n');
  console.log('='.repeat(80));

  // Obtener credenciales desde argumentos o variables de entorno
  const appKey = process.argv[2] || process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_AFFILIATE_SANDBOX_APP_KEY;
  const appSecret = process.argv[3] || process.env.ALIEXPRESS_AFFILIATE_APP_SECRET || process.env.ALIEXPRESS_AFFILIATE_SANDBOX_APP_SECRET;
  const sandboxArg = process.argv[4]?.toLowerCase();
  const isSandbox = sandboxArg === 'true' || sandboxArg === 'sandbox' || 
                    process.env.ALIEXPRESS_AFFILIATE_SANDBOX === 'true' ||
                    (appKey && process.env.ALIEXPRESS_AFFILIATE_SANDBOX_APP_KEY && appKey === process.env.ALIEXPRESS_AFFILIATE_SANDBOX_APP_KEY);

  const testQuery = process.argv[5] || 'smartwatch';

  console.log(`\n📋 CONFIGURACIÓN:\n`);
  console.log(`   - appKey: ${appKey ? `${appKey.substring(0, 10)}...` : '❌ NO CONFIGURADO'}`);
  console.log(`   - appSecret: ${appSecret ? '✓ Configurado' : '❌ NO CONFIGURADO'}`);
  console.log(`   - Ambiente: ${isSandbox ? 'SANDBOX' : 'PRODUCTION'}`);
  console.log(`   - Query: "${testQuery}"`);

  if (!appKey || !appSecret) {
    console.log(`\n❌ ERROR: Faltan credenciales\n`);
    console.log(`💡 Uso del script:`);
    console.log(`   npx tsx src/scripts/test-aliexpress-api-direct.ts [appKey] [appSecret] [sandbox] [query]`);
    console.log(`\n   O configura las variables de entorno:`);
    console.log(`   - ALIEXPRESS_AFFILIATE_APP_KEY`);
    console.log(`   - ALIEXPRESS_AFFILIATE_APP_SECRET`);
    console.log(`   - ALIEXPRESS_AFFILIATE_SANDBOX (opcional, 'true' para sandbox)`);
    console.log(`\n   Para sandbox:`);
    console.log(`   - ALIEXPRESS_AFFILIATE_SANDBOX_APP_KEY`);
    console.log(`   - ALIEXPRESS_AFFILIATE_SANDBOX_APP_SECRET`);
    process.exit(1);
  }

  // Inicializar servicio
  console.log(`\n2️⃣ Inicializando AliExpress Affiliate API Service...`);
  const apiService = new AliExpressAffiliateAPIService();
  apiService.setCredentials({
    appKey,
    appSecret,
    sandbox: isSandbox,
  });
  console.log(`   ✅ Servicio inicializado`);

  // Buscar productos
  console.log(`\n3️⃣ Buscando productos con query: "${testQuery}"...`);
  const searchStartTime = Date.now();
  
  try {
    const products = await apiService.searchProducts({
      keywords: testQuery,
      pageSize: 5,
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
      console.log(`      - Credenciales incorrectas`);
      process.exit(1);
    }

    console.log(`   ✅ Productos encontrados: ${products.length} (${searchDuration}ms)`);

    // Analizar cada producto
    console.log(`\n4️⃣ Analizando productos extraídos:\n`);
    
    for (let i = 0; i < Math.min(products.length, 3); i++) {
      const product = products[i];
      console.log(`   📦 Producto #${i + 1}:`);
      console.log(`      - ID: ${product.productId}`);
      console.log(`      - Título: ${product.productTitle?.substring(0, 70)}`);
      console.log(`      - Precio: ${product.salePrice} ${product.currency || 'USD'}`);
      console.log(`      - Precio original: ${product.originalPrice} ${product.currency || 'USD'}`);
      console.log(`      - Descuento: ${product.discount || 0}%`);
      console.log(`      - Rating: ${product.evaluateScore || 'N/A'}`);
      console.log(`      - Ventas: ${product.volume || 0}`);
      console.log(`      - Tienda: ${product.storeName || 'N/A'}`);
      
      // Analizar imágenes
      console.log(`      - Imagen principal: ${product.productMainImageUrl ? '✓' : '✗'}`);
      if (product.productMainImageUrl) {
        console.log(`        URL: ${product.productMainImageUrl.substring(0, 90)}...`);
        
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
          console.log(`         ${idx + 1}. ${img.substring(0, 90)}...`);
        });
      } else {
        console.log(`      ⚠️  No hay imágenes válidas después del filtrado`);
      }
      
      console.log(''); // Línea en blanco entre productos
    }

    // Obtener detalles de envío
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
    console.log(`\n✅ PRUEBA EXITOSA\n`);
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
    console.log(`   - Imágenes válidas (≥200px): ${products.reduce((acc, p) => {
      const allRawImages = Array.from(new Set([
        p.productMainImageUrl,
        ...(p.productSmallImageUrls || [])
      ].filter(Boolean))) as string[];
      
      const filtered = allRawImages.filter(imgUrl => {
        if (!imgUrl) return false;
        const sizePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
        const sizeMatch = imgUrl.match(sizePattern);
        if (sizeMatch) {
          const width = parseInt(sizeMatch[1], 10);
          const height = parseInt(sizeMatch[2], 10);
          if (width < 200 || height < 200) return false;
        }
        const thumbnailPatterns = [
          /\/50x50/i, /\/100x100/i, /\/150x150/i, /thumbnail/i, /thumb/i, /_50x50/i, /_100x100/i,
        ];
        if (thumbnailPatterns.some(pattern => pattern.test(imgUrl))) return false;
        return true;
      });
      
      return acc + filtered.length;
    }, 0)}`);
    console.log(`   - Status: ✅ API funcionando correctamente`);
    console.log(`\n💡 El sistema puede usar la API oficial de AliExpress para extraer datos e imágenes\n`);
    
  } catch (apiError: any) {
    const errorMessage = apiError?.message || String(apiError);
    const searchDuration = Date.now() - searchStartTime;
    
    console.log(`\n   ❌ Error en llamada a API (${searchDuration}ms):`);
    console.log(`      Error: ${errorMessage}`);
    
    if (errorMessage.includes('timeout')) {
      console.log(`\n   ⚠️  TIMEOUT: La API no respondió a tiempo (${searchDuration}ms)`);
      console.log(`   💡 Posibles soluciones:`);
      console.log(`      - Verificar conectividad con AliExpress`);
      console.log(`      - Revisar credenciales`);
      console.log(`      - La API puede estar temporalmente inaccesible`);
    } else if (errorMessage.includes('credentials') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      console.log(`\n   ⚠️  ERROR DE AUTENTICACIÓN`);
      console.log(`   💡 Soluciones:`);
      console.log(`      - Verificar que appKey y appSecret sean correctos`);
      console.log(`      - Revisar que las credenciales estén activas en AliExpress Open Platform`);
      console.log(`      - Verificar que el ambiente (sandbox/production) sea correcto`);
    } else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
      console.log(`\n   ⚠️  ERROR DE PERMISOS`);
      console.log(`   💡 La aplicación puede no tener permisos para acceder a la API`);
    } else {
      console.log(`\n   ⚠️  ERROR DESCONOCIDO`);
      console.log(`   💡 Detalles: ${errorMessage}`);
    }
    
    process.exit(1);
  }
}

// Ejecutar prueba
testAliExpressAPIDirect()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    logger.error('Error fatal en script de prueba directa', {
      error: error?.message || String(error),
      stack: error?.stack
    });
    process.exit(1);
  });

