/**
 * Script de prueba para simular el flujo completo de opportunity-finder
 * y verificar que la API de AliExpress se está usando correctamente
 */

import { AdvancedMarketplaceScraper } from '../services/advanced-scraper.service';
import { CredentialsManager } from '../services/credentials-manager.service';
import logger from '../config/logger';

async function testOpportunityFinderFlow() {
  console.log('\n🧪 TESTING OPPORTUNITY FINDER FLOW - AliExpress API Integration\n');
  console.log('='.repeat(80));

  const testUserId = 1;
  const testQuery = 'smartwatch';
  const testEnvironment: 'sandbox' | 'production' = 'sandbox';

  try {
    // 1. Verificar credenciales (como lo hace opportunity-finder)
    console.log(`\n1️⃣ Verificando credenciales de AliExpress Affiliate API...`);
    const affiliateCreds = await CredentialsManager.getCredentials(
      testUserId,
      'aliexpress-affiliate',
      testEnvironment
    );

    if (!affiliateCreds) {
      console.log(`   ❌ No se encontraron credenciales en ${testEnvironment}`);
      console.log(`   💡 Intentando production...`);
      const prodCreds = await CredentialsManager.getCredentials(
        testUserId,
        'aliexpress-affiliate',
        'production'
      );
      if (prodCreds) {
        console.log(`   ✅ Credenciales encontradas en production`);
      } else {
        console.log(`   ❌ No se encontraron credenciales en ningún ambiente`);
        console.log(`   💡 Configura las credenciales en API Settings`);
        process.exit(1);
      }
    } else {
      console.log(`   ✅ Credenciales encontradas en ${testEnvironment}`);
      console.log(`      - appKey: ${affiliateCreds.appKey?.substring(0, 10)}...`);
      console.log(`      - sandbox: ${affiliateCreds.sandbox}`);
    }

    // 2. Inicializar scraper (como lo hace opportunity-finder)
    console.log(`\n2️⃣ Inicializando AdvancedMarketplaceScraper...`);
    const scraper = new AdvancedMarketplaceScraper();
    
    // Verificar si necesita inicializar browser
    if (!scraper['browser']) {
      console.log(`   Inicializando browser...`);
      await scraper['init']();
      console.log(`   ✅ Browser inicializado`);
    } else {
      console.log(`   ✅ Browser ya está inicializado`);
    }

    // 3. Llamar scrapeAliExpress (como lo hace opportunity-finder)
    console.log(`\n3️⃣ Llamando scrapeAliExpress (debería intentar API primero)...`);
    console.log(`   Query: "${testQuery}"`);
    console.log(`   UserId: ${testUserId}`);
    console.log(`   Environment: ${testEnvironment}`);
    console.log(`   BaseCurrency: USD`);
    
    const startTime = Date.now();
    const products = await scraper.scrapeAliExpress(
      testUserId,
      testQuery,
      testEnvironment,
      'USD'
    );
    const duration = Date.now() - startTime;

    console.log(`\n4️⃣ Resultados:`);
    console.log(`   - Tiempo total: ${duration}ms`);
    console.log(`   - Productos encontrados: ${products?.length || 0}`);

    if (products && products.length > 0) {
      console.log(`\n   📦 Primeros 3 productos:`);
      products.slice(0, 3).forEach((p: any, idx: number) => {
        console.log(`\n   Producto #${idx + 1}:`);
        console.log(`      - Título: ${p.title?.substring(0, 60)}...`);
        console.log(`      - Precio: ${p.price} ${p.currency || 'USD'}`);
        console.log(`      - URL: ${p.productUrl?.substring(0, 80)}...`);
        console.log(`      - Imagen: ${p.imageUrl ? '✓' : '✗'}`);
        console.log(`      - Imágenes: ${Array.isArray(p.images) ? p.images.length : 0}`);
        console.log(`      - Shipping: ${p.shipping || 'N/A'}`);
        console.log(`      - Shipping Cost: ${p.shippingCost || 'N/A'}`);
      });

      // Verificar si las imágenes parecen venir de la API
      const hasApiImages = products.some((p: any) => 
        p.imageUrl && (
          p.imageUrl.includes('ae01.alicdn.com') || 
          p.imageUrl.includes('ae02.alicdn.com') ||
          p.imageUrl.includes('ae03.alicdn.com')
        )
      );

      if (hasApiImages) {
        console.log(`\n   ✅ Las imágenes parecen venir de la API oficial de AliExpress`);
      } else {
        console.log(`\n   ⚠️  Las imágenes podrían venir del scraping nativo`);
      }

      console.log(`\n   ✅ PRUEBA EXITOSA: Se encontraron productos`);
      console.log(`   💡 Revisa los logs anteriores para ver si se usó la API o scraping nativo`);
    } else {
      console.log(`\n   ⚠️  No se encontraron productos`);
      console.log(`   💡 Revisa los logs anteriores para ver qué falló`);
    }

    // 5. Limpiar
    console.log(`\n5️⃣ Limpiando...`);
    try {
      await scraper['cleanup']();
      console.log(`   ✅ Limpieza completada`);
    } catch (cleanupError: any) {
      console.log(`   ⚠️  Error en limpieza: ${cleanupError?.message || String(cleanupError)}`);
    }

  } catch (error: any) {
    console.error(`\n❌ ERROR FATAL:`, error);
    logger.error('Error en test de opportunity-finder flow', {
      error: error?.message || String(error),
      stack: error?.stack,
      userId: testUserId,
      query: testQuery,
      environment: testEnvironment
    });
    process.exit(1);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🏁 TEST COMPLETADO\n`);
}

testOpportunityFinderFlow()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });

