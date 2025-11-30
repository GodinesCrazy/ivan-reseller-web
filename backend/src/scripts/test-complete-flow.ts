/**
 * Script de prueba completo para verificar el flujo de extracción de datos e imágenes
 * desde AliExpress Affiliate API hasta la creación del producto
 * 
 * Ejecutar: npx tsx backend/src/scripts/test-complete-flow.ts
 */

import { AliExpressAffiliateAPIService } from '../services/aliexpress-affiliate-api.service';
import { CredentialsManager } from '../services/credentials-manager.service';
import { AdvancedMarketplaceScraper } from '../services/advanced-scraper.service';
import { OpportunityFinderService } from '../services/opportunity-finder.service';
import logger from '../config/logger';

async function testCompleteFlow() {
  console.log('\n🧪 INICIANDO PRUEBA COMPLETA DEL FLUJO DE EXTRACCIÓN\n');
  
  const testUserId = 1;
  const testQuery = 'dron';
  const testEnvironment: 'sandbox' | 'production' = 'sandbox';
  
  try {
    // PASO 1: Verificar credenciales
    console.log('📋 PASO 1: Verificando credenciales...');
    const affiliateCreds = await CredentialsManager.getCredentials(
      testUserId,
      'aliexpress-affiliate',
      testEnvironment
    );
    
    if (!affiliateCreds) {
      console.error('❌ ERROR: No se encontraron credenciales de Affiliate API');
      return;
    }
    console.log('✅ Credenciales encontradas');
    
    // PASO 2: Probar búsqueda directa con Affiliate API
    console.log('\n📋 PASO 2: Probando búsqueda directa con Affiliate API...');
    const affiliateService = new AliExpressAffiliateAPIService();
    affiliateService.setCredentials(affiliateCreds);
    
    const startTime = Date.now();
    const affiliateProducts = await affiliateService.searchProducts({
      keywords: testQuery,
      pageSize: 3,
      targetCurrency: 'USD',
      targetLanguage: 'ES',
      shipToCountry: 'US',
      sort: 'LAST_VOLUME_DESC',
    });
    const duration = Date.now() - startTime;
    
    if (!affiliateProducts || affiliateProducts.length === 0) {
      console.error('❌ ERROR: La API no retornó productos');
      return;
    }
    
    console.log(`✅ Productos encontrados: ${affiliateProducts.length} (${duration}ms)`);
    
    // Verificar primer producto
    const firstProduct = affiliateProducts[0];
    console.log(`\n📦 Primer producto:`);
    console.log(`   Título: ${firstProduct.productTitle?.substring(0, 60)}...`);
    console.log(`   Precio: ${firstProduct.salePrice} ${firstProduct.currency}`);
    console.log(`   Imagen principal: ${firstProduct.productMainImageUrl ? '✅' : '❌'}`);
    console.log(`   Imágenes adicionales: ${firstProduct.productSmallImageUrls?.length || 0}`);
    
    // PASO 3: Probar scrapeAliExpress (integración completa)
    console.log('\n📋 PASO 3: Probando scrapeAliExpress (integración completa)...');
    const scraper = new AdvancedMarketplaceScraper();
    await scraper.init();
    
    const scrapedProducts = await scraper.scrapeAliExpress(
      testUserId,
      testQuery,
      testEnvironment,
      'USD'
    );
    
    console.log(`✅ scrapeAliExpress completado: ${scrapedProducts.length} productos`);
    
    if (scrapedProducts.length > 0) {
      const firstScraped = scrapedProducts[0];
      console.log(`\n📦 Primer producto scrapeado:`);
      console.log(`   Título: ${firstScraped.title?.substring(0, 60)}...`);
      console.log(`   Precio: ${firstScraped.price} ${firstScraped.currency}`);
      console.log(`   Imagen principal: ${firstScraped.imageUrl ? '✅' : '❌'}`);
      if (firstScraped.imageUrl) {
        console.log(`     URL: ${firstScraped.imageUrl.substring(0, 80)}...`);
      }
      console.log(`   Total imágenes: ${firstScraped.images?.length || 0}`);
      if (firstScraped.images && firstScraped.images.length > 0) {
        console.log(`   Primera imagen: ${firstScraped.images[0]?.substring(0, 80)}...`);
        console.log(`   Segunda imagen: ${firstScraped.images[1] ? firstScraped.images[1].substring(0, 80) + '...' : 'N/A'}`);
      }
      console.log(`   Shipping: ${firstScraped.shipping}`);
    }
    
    await scraper.cleanup();
    
    // PASO 4: Probar findOpportunities (flujo completo)
    console.log('\n📋 PASO 4: Probando findOpportunities (flujo completo)...');
    const opportunityFinder = new OpportunityFinderService();
    
    const opportunities = await opportunityFinder.findOpportunities(testUserId, {
      query: testQuery,
      maxItems: 3,
      marketplaces: ['ebay', 'amazon', 'mercadolibre'],
      region: 'us',
      environment: testEnvironment
    });
    
    console.log(`✅ findOpportunities completado: ${opportunities.length} oportunidades`);
    
    if (opportunities.length > 0) {
      const firstOpp = opportunities[0];
      console.log(`\n📦 Primera oportunidad:`);
      console.log(`   Título: ${firstOpp.title?.substring(0, 60)}...`);
      console.log(`   Imagen: ${firstOpp.image ? '✅' : '❌'}`);
      if (firstOpp.image) {
        console.log(`     URL: ${firstOpp.image.substring(0, 80)}...`);
      }
      console.log(`   Total imágenes: ${firstOpp.images?.length || 0}`);
      if (firstOpp.images && firstOpp.images.length > 0) {
        console.log(`   Primera imagen: ${firstOpp.images[0]?.substring(0, 80)}...`);
        console.log(`   Segunda imagen: ${firstOpp.images[1] ? firstOpp.images[1].substring(0, 80) + '...' : 'N/A'}`);
      }
      console.log(`   Costo: ${firstOpp.costUsd} ${firstOpp.costCurrency}`);
      console.log(`   Precio sugerido: ${firstOpp.suggestedPriceUsd} ${firstOpp.suggestedPriceCurrency}`);
    }
    
    // RESUMEN
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DEL FLUJO COMPLETO');
    console.log('='.repeat(60));
    console.log(`✅ Affiliate API: ${affiliateProducts.length} productos encontrados`);
    console.log(`✅ scrapeAliExpress: ${scrapedProducts.length} productos procesados`);
    console.log(`✅ findOpportunities: ${opportunities.length} oportunidades generadas`);
    
    if (opportunities.length > 0 && opportunities[0].images && opportunities[0].images.length > 0) {
      console.log(`✅ Imágenes: ${opportunities[0].images.length} imágenes disponibles en oportunidad`);
      console.log('✅ FLUJO COMPLETO FUNCIONANDO CORRECTAMENTE');
    } else {
      console.log('⚠️  ADVERTENCIA: No se detectaron imágenes en las oportunidades');
    }
    
    console.log('\n✅ PRUEBA COMPLETADA\n');
    
  } catch (error: any) {
    console.error('\n❌ ERROR EN LA PRUEBA:');
    console.error(`   Mensaje: ${error?.message || String(error)}`);
    console.error(`   Stack: ${error?.stack?.substring(0, 500)}...`);
    process.exit(1);
  }
}

testCompleteFlow()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });

