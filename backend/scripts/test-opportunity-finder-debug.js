/**
 * Script de diagnóstico completo para AI Opportunity Finder
 * 
 * Este script prueba todo el flujo desde el scraper hasta la normalización
 * para identificar exactamente dónde se pierden los productos.
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configuración
const TEST_QUERIES = ['auriculares', 'gaming', 'mouse', 'smartwatch'];
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_USER_ID = 1; // Usar el usuario admin por defecto

async function testOpportunityFinder() {
  console.log('🔍 Iniciando diagnóstico completo de AI Opportunity Finder\n');
  console.log('=' .repeat(80));

  for (const query of TEST_QUERIES) {
    console.log(`\n📋 Test: "${query}"`);
    console.log('-'.repeat(80));
    
    try {
      // Simular login y obtener token
      const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email: 'admin@ivanreseller.com',
        password: 'admin123'
      });
      
      const token = loginResponse.data.token;
      
      // Llamar al endpoint de oportunidades
      const startTime = Date.now();
      const response = await axios.get(`${API_BASE_URL}/api/opportunities`, {
        params: {
          query,
          maxItems: 10,
          marketplaces: 'ebay,amazon,mercadolibre',
          region: 'us'
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const duration = Date.now() - startTime;
      
      const items = response.data?.items || [];
      const debugInfo = response.data?.debug || null;
      
      console.log(`✅ Response recibida en ${duration}ms`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Items encontrados: ${items.length}`);
      console.log(`   Success: ${response.data?.success}`);
      console.log(`   Query: ${response.data?.query}`);
      
      if (items.length > 0) {
        console.log(`\n   📦 Primer producto encontrado:`);
        const first = items[0];
        console.log(`      - Título: ${first.title?.substring(0, 60) || 'N/A'}`);
        console.log(`      - Precio: ${first.costUsd || first.costAmount || 'N/A'} ${first.costCurrency || 'N/A'}`);
        console.log(`      - Precio sugerido: ${first.suggestedPriceUsd || first.suggestedPriceAmount || 'N/A'} ${first.suggestedPriceCurrency || 'N/A'}`);
        console.log(`      - Margen: ${((first.profitMargin || 0) * 100).toFixed(1)}%`);
        console.log(`      - ROI: ${first.roiPercentage || 0}%`);
        console.log(`      - Imagen: ${first.image ? '✅' : '❌'}`);
        console.log(`      - URL: ${first.aliexpressUrl ? '✅' : '❌'}`);
      } else {
        console.log(`\n   ⚠️  No se encontraron productos`);
        if (debugInfo) {
          console.log(`   📝 Debug info:`);
          console.log(`      - Mensaje: ${debugInfo.message || 'N/A'}`);
          if (debugInfo.possibleCauses) {
            console.log(`      - Posibles causas:`);
            debugInfo.possibleCauses.forEach((cause, i) => {
              console.log(`        ${i + 1}. ${cause}`);
            });
          }
          if (debugInfo.suggestions) {
            console.log(`      - Sugerencias:`);
            debugInfo.suggestions.forEach((suggestion, i) => {
              console.log(`        ${i + 1}. ${suggestion}`);
            });
          }
        }
      }
      
      // Verificar que los productos tienen datos válidos
      if (items.length > 0) {
        const validProducts = items.filter(item => {
          const hasTitle = item.title && item.title.trim().length > 0;
          const hasPrice = (item.costUsd || item.costAmount) > 0;
          const hasSuggestedPrice = (item.suggestedPriceUsd || item.suggestedPriceAmount) > 0;
          const hasUrl = item.aliexpressUrl && item.aliexpressUrl.length > 10;
          return hasTitle && hasPrice && hasSuggestedPrice && hasUrl;
        });
        
        console.log(`\n   ✅ Productos válidos: ${validProducts.length}/${items.length}`);
        
        if (validProducts.length < items.length) {
          const invalid = items.filter(item => {
            const hasTitle = item.title && item.title.trim().length > 0;
            const hasPrice = (item.costUsd || item.costAmount) > 0;
            const hasSuggestedPrice = (item.suggestedPriceUsd || item.suggestedPriceAmount) > 0;
            const hasUrl = item.aliexpressUrl && item.aliexpressUrl.length > 10;
            return !(hasTitle && hasPrice && hasSuggestedPrice && hasUrl);
          });
          
          console.log(`   ⚠️  Productos inválidos encontrados: ${invalid.length}`);
          invalid.slice(0, 3).forEach((item, i) => {
            console.log(`      ${i + 1}. Título: ${item.title?.substring(0, 40) || 'N/A'}`);
            console.log(`         - Tiene título: ${!!item.title}`);
            console.log(`         - Tiene precio: ${!!((item.costUsd || item.costAmount) > 0)}`);
            console.log(`         - Tiene precio sugerido: ${!!((item.suggestedPriceUsd || item.suggestedPriceAmount) > 0)}`);
            console.log(`         - Tiene URL: ${!!(item.aliexpressUrl && item.aliexpressUrl.length > 10)}`);
          });
        }
      }
      
    } catch (error) {
      console.log(`\n❌ Error en test "${query}":`);
      console.log(`   Mensaje: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      if (error.stack) {
        console.log(`   Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Diagnóstico completo');
  
  await prisma.$disconnect();
}

// Ejecutar diagnóstico
testOpportunityFinder().catch(error => {
  console.error('❌ Error fatal en diagnóstico:', error);
  process.exit(1);
});

