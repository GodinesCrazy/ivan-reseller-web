// Test directo para verificar que el sistema encuentra oportunidades
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testOpportunities() {
  try {
    console.log('🔍 Conectando a la base de datos...');
    await prisma.$connect();
    
    console.log('🔍 Buscando usuario ADMIN...');
    const adminUser = await prisma.user.findFirst({ 
      where: { role: 'ADMIN' },
      select: { id: true, username: true, email: true }
    });

    if (!adminUser) {
      console.error('❌ No se encontró usuario ADMIN. Asegúrate de que la base de datos esté seeded.');
      return;
    }
    
    console.log(`✅ Usuario encontrado: ${adminUser.username} (ID: ${adminUser.id}, Email: ${adminUser.email})`);

    // Importar opportunity-finder después de que Prisma esté listo
    console.log('📦 Cargando opportunity-finder service...');
    let opportunityFinder;
    try {
      opportunityFinder = require('./dist/services/opportunity-finder.service').default;
    } catch (importError) {
      console.error('❌ Error importando opportunity-finder:', importError.message);
      console.log('⚠️  Necesitas compilar primero: npm run build');
      console.log('   O si ya está compilado, verifica que dist/services/opportunity-finder.service.js exista');
      return;
    }

    const userId = adminUser.id;
    const query = 'gaming';
    const maxItems = 10;
    const marketplaces = ['ebay', 'amazon', 'mercadolibre'];
    const region = 'us';
    const environment = 'production';

    console.log(`\n🔍 Iniciando búsqueda de oportunidades...`);
    console.log(`   Query: "${query}"`);
    console.log(`   Max Items: ${maxItems}`);
    console.log(`   Marketplaces: ${marketplaces.join(', ')}`);
    console.log(`   Region: ${region}`);
    console.log(`   Environment: ${environment}\n`);

    const startTime = Date.now();
    const opportunities = await opportunityFinder.findOpportunities(userId, {
      query,
      maxItems,
      marketplaces,
      region,
      environment
    });
    const duration = Date.now() - startTime;

    console.log(`\n⏱️  Tiempo de búsqueda: ${(duration / 1000).toFixed(2)}s\n`);

    if (opportunities && opportunities.length > 0) {
      console.log(`✅ ÉXITO: Se encontraron ${opportunities.length} oportunidades:\n`);
      opportunities.slice(0, 5).forEach((opp, index) => {
        console.log(`  ${index + 1}. ${opp.title?.substring(0, 60)}...`);
        console.log(`     Costo: $${opp.costUsd?.toFixed(2) || 'N/A'} ${opp.baseCurrency || 'USD'}`);
        console.log(`     Sugerido: $${opp.suggestedPriceUsd?.toFixed(2) || 'N/A'} ${opp.suggestedPriceCurrency || 'USD'}`);
        console.log(`     Margen: ${((opp.profitMargin || 0) * 100).toFixed(2)}%`);
        console.log(`     ROI: ${(opp.roiPercentage || 0).toFixed(2)}%`);
        console.log(`     URL: ${opp.productUrl?.substring(0, 80) || 'N/A'}...`);
        console.log('');
      });
      if (opportunities.length > 5) {
        console.log(`  ... y ${opportunities.length - 5} más\n`);
      }
      console.log(`\n✅ TEST PASADO: El sistema encontró ${opportunities.length} oportunidades correctamente.`);
      process.exit(0);
    } else {
      console.warn('⚠️  No se encontraron oportunidades.');
      console.log('\n📋 Diagnóstico:');
      console.log('   1. Verificar que AliExpress no esté bloqueando completamente');
      console.log('   2. Verificar logs del backend para más detalles');
      console.log('   3. Considerar configurar ScraperAPI o ZenRows como fallback');
      console.log('\n❌ TEST FALLÓ: No se encontraron oportunidades.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error durante la búsqueda:');
    console.error('   Mensaje:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testOpportunities();

