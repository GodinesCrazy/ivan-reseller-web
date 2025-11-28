/**
 * Script de prueba para verificar si el sistema encuentra oportunidades
 * Uso: npx ts-node backend/scripts/test-opportunity-finder.ts
 */

import opportunityFinder from '../src/services/opportunity-finder.service';
import { logger } from '../src/config/logger';

async function testOpportunityFinder() {
  const userId = 1; // Usuario de prueba
  const testQueries = [
    'phone case',
    'laptop stand',
    'wireless mouse',
    'gamer', // Query del log que falló
  ];

  console.log('🧪 Iniciando pruebas de búsqueda de oportunidades...\n');

  for (const query of testQueries) {
    console.log(`\n📋 Probando query: "${query}"`);
    console.log('─'.repeat(60));
    
    try {
      const startTime = Date.now();
      const opportunities = await opportunityFinder.findOpportunities(userId, {
        query,
        maxItems: 5,
        marketplaces: ['ebay'],
        region: 'us',
        environment: 'sandbox'
      });
      
      const duration = Date.now() - startTime;
      
      console.log(`✅ Completado en ${(duration / 1000).toFixed(2)}s`);
      console.log(`📊 Oportunidades encontradas: ${opportunities.length}`);
      
      if (opportunities.length > 0) {
        console.log('\n📦 Primeras oportunidades:');
        opportunities.slice(0, 3).forEach((opp, idx) => {
          console.log(`  ${idx + 1}. ${opp.title?.substring(0, 60)}`);
          console.log(`     Precio: $${opp.costUsd?.toFixed(2)} | Margen: ${(opp.profitMargin * 100).toFixed(1)}% | ROI: ${opp.roiPercentage?.toFixed(1)}%`);
          console.log(`     URL: ${opp.aliexpressUrl?.substring(0, 70)}...`);
        });
      } else {
        console.log('⚠️  No se encontraron oportunidades para este query');
        console.log('   Posibles causas:');
        console.log('   - AliExpress está bloqueando el scraping');
        console.log('   - El query no tiene resultados');
        console.log('   - Los productos fueron descartados por validaciones');
        console.log('   - Falta de datos de competencia (margen bajo)');
      }
    } catch (error: any) {
      console.error(`❌ Error al buscar oportunidades:`, error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Pruebas completadas');
  console.log('\n💡 Si no se encuentran oportunidades, revisa:');
  console.log('   1. Logs del servidor para ver errores de scraping');
  console.log('   2. Si AliExpress está bloqueando (página "punish")');
  console.log('   3. Si los productos son descartados por validaciones');
  console.log('   4. Si el margen mínimo es muy alto');
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  testOpportunityFinder()
    .then(() => {
      console.log('\n✨ Script finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error fatal:', error);
      process.exit(1);
    });
}

export { testOpportunityFinder };

