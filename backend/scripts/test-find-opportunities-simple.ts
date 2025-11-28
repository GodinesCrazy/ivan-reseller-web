/**
 * Script simple para probar si findOpportunities retorna resultados
 * Ejecutar: npx ts-node backend/scripts/test-find-opportunities-simple.ts
 */

import opportunityFinder from '../src/services/opportunity-finder.service';

async function testFindOpportunities() {
  console.log('🧪 Probando findOpportunities...\n');
  
  const userId = 1;
  const testQuery = 'phone case'; // Query simple y común
  
  console.log(`📋 Query: "${testQuery}"`);
  console.log(`👤 UserId: ${userId}\n`);
  
  try {
    console.log('⏳ Buscando oportunidades...');
    const startTime = Date.now();
    
    const opportunities = await opportunityFinder.findOpportunities(userId, {
      query: testQuery,
      maxItems: 5,
      marketplaces: ['ebay'],
      region: 'us',
      environment: 'sandbox'
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`\n✅ Búsqueda completada en ${(duration / 1000).toFixed(2)}s`);
    console.log(`📊 Resultados: ${opportunities.length} oportunidades encontradas\n`);
    
    if (opportunities.length > 0) {
      console.log('🎉 ¡OPORTUNIDADES ENCONTRADAS!\n');
      console.log('📦 Primeras 3 oportunidades:');
      opportunities.slice(0, 3).forEach((opp, idx) => {
        console.log(`\n${idx + 1}. ${opp.title?.substring(0, 70)}`);
        console.log(`   💰 Costo: $${opp.costUsd?.toFixed(2)} ${opp.costCurrency}`);
        console.log(`   💵 Precio sugerido: $${opp.suggestedPriceUsd?.toFixed(2)} ${opp.suggestedPriceCurrency}`);
        console.log(`   📈 Margen: ${(opp.profitMargin * 100).toFixed(1)}%`);
        console.log(`   📊 ROI: ${opp.roiPercentage?.toFixed(1)}%`);
        console.log(`   🔗 URL: ${opp.aliexpressUrl?.substring(0, 80)}...`);
        if (opp.estimationNotes && opp.estimationNotes.length > 0) {
          console.log(`   ⚠️  Notas: ${opp.estimationNotes.slice(0, 2).join('; ')}`);
        }
      });
      console.log('\n✅ El sistema ESTÁ encontrando oportunidades');
      process.exit(0);
    } else {
      console.log('❌ NO se encontraron oportunidades');
      console.log('\n🔍 Posibles causas:');
      console.log('   1. AliExpress está bloqueando el scraping');
      console.log('   2. El scraper retornó productos vacíos');
      console.log('   3. Los productos fueron descartados por validaciones');
      console.log('   4. El margen mínimo no se cumplió');
      console.log('   5. Falta de datos de competencia');
      console.log('\n⚠️  El sistema NO está encontrando oportunidades');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error al buscar oportunidades:');
    console.error(`   Mensaje: ${error.message}`);
    if (error.stack) {
      console.error(`\n   Stack:\n${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }
    console.log('\n❌ El sistema falló al buscar oportunidades');
    process.exit(1);
  }
}

// Ejecutar
testFindOpportunities();

