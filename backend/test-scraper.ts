/**
 * Script de prueba para verificar el scraper de AliExpress
 */

import { AdvancedMarketplaceScraper } from './src/services/advanced-scraper.service';

async function testScraper() {
  console.log('🧪 Iniciando prueba del scraper de AliExpress...\n');

  const scraper = new AdvancedMarketplaceScraper();

  try {
    // Inicializar scraper
    console.log('1️⃣ Inicializando navegador...');
    await scraper.init();
    console.log('✅ Navegador inicializado\n');

    // Probar scraping con una búsqueda simple
    const testQuery = 'organizador cocina';
    console.log(`2️⃣ Probando scraping con query: "${testQuery}"`);
    console.log('⏳ Esto puede tomar 30-60 segundos...\n');

    const startTime = Date.now();
    const results = await scraper.scrapeAliExpress(testQuery);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Scraping completado en ${duration}s`);
    console.log(`📊 Productos encontrados: ${results.length}\n`);

    if (results.length > 0) {
      console.log('📦 Primeros 3 productos encontrados:');
      console.log('─'.repeat(80));
      results.slice(0, 3).forEach((product, index) => {
        console.log(`\n${index + 1}. ${product.title}`);
        console.log(`   Precio: $${product.price}`);
        console.log(`   Rating: ${product.rating}/5 (${product.reviewCount} reviews)`);
        console.log(`   URL: ${product.productUrl.substring(0, 80)}...`);
        console.log(`   Imagen: ${product.imageUrl ? '✅' : '❌'}`);
      });
      console.log('\n' + '─'.repeat(80));
      console.log('\n✅ SCRAPER FUNCIONANDO CORRECTAMENTE');
    } else {
      console.log('⚠️  No se encontraron productos. Posibles causas:');
      console.log('   - CAPTCHA bloqueando el acceso');
      console.log('   - Selectores CSS cambiaron en AliExpress');
      console.log('   - Problema de conexión');
      console.log('\n❌ SCRAPER NO ENCONTRÓ PRODUCTOS');
    }

  } catch (error: any) {
    console.error('\n❌ ERROR EN EL SCRAPER:');
    console.error('─'.repeat(80));
    console.error(`Mensaje: ${error.message}`);
    console.error(`Código: ${error.code || 'N/A'}`);
    
    if (error.code === 'CAPTCHA_REQUIRED') {
      console.error('\n🛡️  CAPTCHA detectado - requiere resolución manual');
    } else {
      console.error('\nStack:', error.stack);
    }
    console.error('─'.repeat(80));
    console.log('\n❌ SCRAPER FALLÓ');
    process.exit(1);
  } finally {
    // Cerrar navegador
    console.log('\n3️⃣ Cerrando navegador...');
    await scraper.close().catch(() => {});
    console.log('✅ Navegador cerrado');
  }
}

// Ejecutar prueba
testScraper()
  .then(() => {
    console.log('\n✅ Prueba completada');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  });

