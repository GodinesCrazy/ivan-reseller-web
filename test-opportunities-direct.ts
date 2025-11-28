/**
 * Test directo para verificar si el sistema encuentra oportunidades
 * Ejecutar: npx ts-node test-opportunities-direct.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import opportunityFinder from './backend/src/services/opportunity-finder.service';
import { logger } from './backend/src/config/logger';

const prisma = new PrismaClient();

async function testOpportunitiesDirect() {
  try {
    console.log('🔍 Conectando a la base de datos...');
    await prisma.$connect();
    
    console.log('🔍 Buscando usuario ADMIN...');
    const adminUser = await prisma.user.findFirst({ 
      where: { role: 'ADMIN' } 
    });

    if (!adminUser) {
      console.error('❌ No se encontró usuario ADMIN. Asegúrate de que la base de datos esté seeded.');
      return;
    }
    
    console.log(`✅ Usuario encontrado: ${adminUser.username} (ID: ${adminUser.id}, Email: ${adminUser.email})\n`);

    const userId = adminUser.id;
    const query = 'gaming';
    const maxItems = 5;
    const marketplaces = ['ebay', 'amazon', 'mercadolibre'];
    const region = 'us';
    const environment = 'production';

    console.log(`🔍 Iniciando búsqueda de oportunidades para query "${query}"...`);
    console.log(`   - Max Items: ${maxItems}`);
    console.log(`   - Marketplaces: ${marketplaces.join(', ')}`);
    console.log(`   - Region: ${region}`);
    console.log(`   - Environment: ${environment}\n`);

    const startTime = Date.now();
    const opportunities = await opportunityFinder.findOpportunities(userId, {
      query,
      maxItems,
      marketplaces,
      region,
      environment
    });
    const duration = Date.now() - startTime;

    console.log(`\n⏱️  Duración: ${duration}ms\n`);

    if (opportunities.length > 0) {
      console.log(`✅ ÉXITO: Se encontraron ${opportunities.length} oportunidades:\n`);
      opportunities.forEach((opp, index) => {
        console.log(`  ${index + 1}. ${opp.title?.substring(0, 60)}...`);
        console.log(`     - Costo: ${opp.costUsd} ${opp.baseCurrency}`);
        console.log(`     - Precio Sugerido: ${opp.suggestedPriceUsd} ${opp.suggestedPriceCurrency}`);
        console.log(`     - Margen: ${(opp.profitMargin * 100).toFixed(2)}%`);
        console.log(`     - ROI: ${(opp.roiPercentage * 100).toFixed(2)}%`);
        console.log(`     - URL: ${opp.productUrl?.substring(0, 80)}...`);
        console.log('');
      });
      console.log('\n✅✅✅ EL SISTEMA ESTÁ FUNCIONANDO CORRECTAMENTE ✅✅✅');
    } else {
      console.warn('⚠️  PROBLEMA: No se encontraron oportunidades.');
      console.log('\n🔍 Posibles causas:');
      console.log('   1. AliExpress está bloqueando el scraping');
      console.log('   2. El término de búsqueda no retorna productos');
      console.log('   3. Los productos encontrados fueron filtrados');
      console.log('\n💡 Verifica los logs para más detalles.');
    }
  } catch (error: any) {
    console.error('❌ Error durante la búsqueda:');
    console.error(`   Mensaje: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Desconectado de la base de datos');
  }
}

testOpportunitiesDirect();

