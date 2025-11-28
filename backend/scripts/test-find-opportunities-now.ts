/**
 * Script de test directo para verificar que el sistema puede encontrar oportunidades
 * Ejecutar con: npx tsx backend/scripts/test-find-opportunities-now.ts
 */

import opportunityFinder from '../src/services/opportunity-finder.service';
import { logger } from '../src/config/logger';

async function testFindOpportunities() {
  const userId = 1; // Cambiar al ID de usuario real si es necesario
  const testQuery = 'gamepad'; // Query simple que debería encontrar productos
  
  console.log('🧪 Iniciando test de búsqueda de oportunidades...');
  console.log(`📋 Query: "${testQuery}"`);
  console.log(`👤 User ID: ${userId}`);
  console.log('---\n');
  
  try {
    const startTime = Date.now();
    
    const items = await opportunityFinder.findOpportunities(userId, {
      query: testQuery,
      maxItems: 5, // Solo buscar 5 productos para test rápido
      marketplaces: ['ebay'] as any,
      region: 'us'
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`\n✅ Test completado en ${(duration / 1000).toFixed(2)}s\n`);
    console.log(`📊 Productos encontrados: ${items.length}\n`);
    
    if (items.length > 0) {
      console.log('✅ ÉXITO: El sistema SÍ puede encontrar oportunidades de negocio\n');
      console.log('Primeros productos encontrados:');
      items.slice(0, 3).forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.title}`);
        console.log(`   Precio: $${item.costUsd.toFixed(2)} USD`);
        console.log(`   Precio sugerido: $${item.suggestedPriceUsd.toFixed(2)} USD`);
        console.log(`   Margen: ${(item.profitMargin * 100).toFixed(1)}%`);
        console.log(`   ROI: ${item.roiPercentage.toFixed(1)}%`);
        console.log(`   URL: ${item.aliexpressUrl}`);
      });
    } else {
      console.log('⚠️  ADVERTENCIA: No se encontraron productos\n');
      console.log('Posibles causas:');
      console.log('  1. AliExpress está bloqueando el scraping (CAPTCHA)');
      console.log('  2. El scraper necesita cookies/sesión activa');
      console.log('  3. Los selectores DOM han cambiado');
      console.log('  4. El bridge Python no está disponible');
      console.log('\n💡 Revisa los logs del servidor para más detalles');
    }
    
    process.exit(items.length > 0 ? 0 : 1);
    
  } catch (error: any) {
    console.error('\n❌ ERROR en el test:\n');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.name === 'ManualAuthRequiredError') {
      console.log('\n🔐 CAPTCHA detectado:');
      console.log(`   Token: ${error.token}`);
      console.log(`   URL de resolución: ${error.loginUrl}`);
      console.log('\n💡 El sistema requiere resolución manual de CAPTCHA');
      console.log('   Esto es normal si AliExpress está bloqueando scraping');
    }
    
    process.exit(1);
  }
}

testFindOpportunities();

