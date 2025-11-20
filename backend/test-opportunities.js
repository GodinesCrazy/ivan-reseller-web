const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testOpportunities() {
  try {
    console.log('🔍 Buscando usuario ADMIN...');
    const user = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, username: true, email: true }
    });

    if (!user) {
      console.log('❌ No se encontró usuario ADMIN');
      process.exit(1);
    }

    console.log('✅ Usuario encontrado:', user.username, '(ID:', user.id, ', Email:', user.email, ')');
    console.log('🔍 Iniciando búsqueda de oportunidades para query "gaming"...\n');

    // Importar el servicio compilado
    const opportunityFinder = require('./dist/services/opportunity-finder.service').default;

    const startTime = Date.now();
    const results = await opportunityFinder.findOpportunities(user.id, {
      query: 'gaming',
      maxItems: 5,
      marketplaces: ['ebay', 'amazon', 'mercadolibre'],
      region: 'us',
      environment: 'production'
    });
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    console.log('\n📊 Resultados de la búsqueda:');
    console.log('   - Tiempo transcurrido:', elapsed, 'segundos');
    console.log('   - Oportunidades encontradas:', results.length);
    
    if (results.length > 0) {
      console.log('\n✅ Primeras oportunidades:');
      results.slice(0, 3).forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.title.substring(0, 60)}`);
        console.log(`      - Precio: $${r.costUsd.toFixed(2)}`);
        console.log(`      - Precio sugerido: $${r.suggestedPriceUsd.toFixed(2)}`);
        console.log(`      - Margen: ${(r.profitMargin * 100).toFixed(1)}%`);
        console.log(`      - ROI: ${r.roiPercentage}%`);
        if (r.estimationNotes && r.estimationNotes.length > 0) {
          console.log(`      - Notas: ${r.estimationNotes[0]}`);
        }
        console.log('');
      });
    } else {
      console.log('\n⚠️  No se encontraron oportunidades');
      console.log('   Posibles causas:');
      console.log('   1. AliExpress está bloqueando el scraping');
      console.log('   2. Las cookies de AliExpress han expirado');
      console.log('   3. Hay un CAPTCHA que necesita resolución manual');
      console.log('   4. El término de búsqueda no tiene resultados');
      console.log('   5. Hay un error en el servicio de scraping');
    }

  } catch (error) {
    console.error('\n❌ Error durante la búsqueda:');
    console.error('   Mensaje:', error.message);
    if (error.stack) {
      console.error('\n   Stack trace:');
      console.error(error.stack.split('\n').slice(0, 10).join('\n'));
    }
    
    // Mostrar información adicional si está disponible
    if (error.cause) {
      console.error('\n   Causa:', error.cause);
    }
    if (error.code) {
      console.error('   Código:', error.code);
    }
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testOpportunities();

