/**
 * Script de validación final para AI Opportunity Finder
 * 
 * Ejecuta búsquedas reales "auriculares" y "gaming" y verifica que
 * se encuentren resultados válidos con todos los campos requeridos.
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configuración
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_QUERIES = [
  { query: 'auriculares', minResults: 10, description: 'Búsqueda de auriculares (mínimo 10 resultados)' },
  { query: 'gaming', minResults: 5, description: 'Búsqueda de productos gaming (mínimo 5 resultados)' }
];

let validationResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

async function login() {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: 'admin@ivanreseller.com',
      password: 'admin123'
    });
    
    if (response.data && response.data.token) {
      return response.data.token;
    }
    
    throw new Error('No se recibió token de autenticación');
  } catch (error) {
    console.error('❌ Error al iniciar sesión:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function searchOpportunities(token, query, minResults) {
  const startTime = Date.now();
  
  try {
    console.log(`\n🔍 Ejecutando búsqueda: "${query}"...`);
    
    const response = await axios.get(`${API_BASE_URL}/api/opportunities`, {
      params: {
        query,
        maxItems: 20,
        marketplaces: 'ebay,amazon,mercadolibre',
        region: 'us'
      },
      headers: {
        Authorization: `Bearer ${token}`
      },
      timeout: 120000 // 2 minutos timeout
    });
    
    const duration = Date.now() - startTime;
    const items = response.data?.items || [];
    const success = response.data?.success || false;
    
    console.log(`   ✅ Respuesta recibida en ${duration}ms`);
    console.log(`   📊 Resultados encontrados: ${items.length}`);
    console.log(`   ✅ Success: ${success}`);
    
    // Validar resultados
    const validation = {
      query,
      itemsFound: items.length,
      meetsMinimum: items.length >= minResults,
      duration,
      success,
      itemsValid: 0,
      itemsInvalid: 0,
      errors: []
    };
    
    // Validar cada resultado
    items.forEach((item, index) => {
      const errors = [];
      
      // Validar campos requeridos
      if (!item.title || item.title.trim().length === 0) {
        errors.push('Sin título');
      }
      
      if ((item.costUsd || item.costAmount || 0) <= 0) {
        errors.push('Precio inválido o cero');
      }
      
      if ((item.suggestedPriceUsd || item.suggestedPriceAmount || 0) <= 0) {
        errors.push('Precio sugerido inválido o cero');
      }
      
      if (!item.aliexpressUrl || item.aliexpressUrl.trim().length < 10) {
        errors.push('URL inválida o muy corta');
      }
      
      if (!item.image || item.image.trim().length === 0) {
        errors.push('Sin imagen');
      }
      
      // Validar cálculos
      if ((item.profitMargin || 0) <= 0 || (item.profitMargin || 0) > 1) {
        errors.push('Margen de ganancia inválido (debe ser entre 0 y 1)');
      }
      
      if ((item.roiPercentage || 0) < 0) {
        errors.push('ROI inválido (debe ser >= 0)');
      }
      
      if ((item.confidenceScore || 0) < 0 || (item.confidenceScore || 0) > 1) {
        errors.push('Confidence score inválido (debe ser entre 0 y 1)');
      }
      
      // Validar que precio sugerido sea mayor que costo
      const cost = item.costUsd || item.costAmount || 0;
      const suggested = item.suggestedPriceUsd || item.suggestedPriceAmount || 0;
      if (suggested <= cost) {
        errors.push('Precio sugerido debe ser mayor que el costo');
      }
      
      if (errors.length === 0) {
        validation.itemsValid++;
      } else {
        validation.itemsInvalid++;
        if (index < 3) { // Solo mostrar errores de los primeros 3
          validation.errors.push({
            index,
            title: item.title?.substring(0, 50) || 'N/A',
            errors
          });
        }
      }
    });
    
    // Mostrar resumen
    console.log(`   ✅ Productos válidos: ${validation.itemsValid}/${items.length}`);
    if (validation.itemsInvalid > 0) {
      console.log(`   ⚠️  Productos inválidos: ${validation.itemsInvalid}`);
      if (validation.errors.length > 0) {
        console.log(`   📝 Errores encontrados (primeros ${validation.errors.length}):`);
        validation.errors.forEach(err => {
          console.log(`      - Producto ${err.index + 1}: ${err.title}`);
          err.errors.forEach(e => console.log(`        • ${e}`));
        });
      }
    }
    
    // Mostrar primer producto válido como ejemplo
    const firstValid = items.find(item => {
      const hasTitle = item.title && item.title.trim().length > 0;
      const hasPrice = (item.costUsd || item.costAmount || 0) > 0;
      const hasUrl = item.aliexpressUrl && item.aliexpressUrl.trim().length > 10;
      return hasTitle && hasPrice && hasUrl;
    });
    
    if (firstValid) {
      console.log(`\n   📦 Ejemplo de producto válido:`);
      console.log(`      Título: ${firstValid.title?.substring(0, 60) || 'N/A'}`);
      console.log(`      Precio: $${firstValid.costUsd || firstValid.costAmount || 0} ${firstValid.costCurrency || 'USD'}`);
      console.log(`      Precio sugerido: $${firstValid.suggestedPriceUsd || firstValid.suggestedPriceAmount || 0} ${firstValid.suggestedPriceCurrency || 'USD'}`);
      console.log(`      Margen: ${((firstValid.profitMargin || 0) * 100).toFixed(1)}%`);
      console.log(`      ROI: ${firstValid.roiPercentage || 0}%`);
      console.log(`      Confidence: ${((firstValid.confidenceScore || 0) * 100).toFixed(1)}%`);
      console.log(`      Imagen: ${firstValid.image ? '✅' : '❌'}`);
      console.log(`      URL: ${firstValid.aliexpressUrl ? '✅' : '❌'}`);
    }
    
    return validation;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`   ❌ Error en búsqueda "${query}":`);
    console.error(`      Mensaje: ${error.message}`);
    if (error.response) {
      console.error(`      Status: ${error.response.status}`);
      console.error(`      Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    return {
      query,
      itemsFound: 0,
      meetsMinimum: false,
      duration,
      success: false,
      itemsValid: 0,
      itemsInvalid: 0,
      errors: [{ index: 0, title: 'Error en búsqueda', errors: [error.message] }]
    };
  }
}

async function validateOpportunityFinder() {
  console.log('🔍 Iniciando validación final de AI Opportunity Finder\n');
  console.log('=' .repeat(80));
  
  try {
    // Iniciar sesión
    console.log('🔐 Iniciando sesión...');
    const token = await login();
    console.log('   ✅ Sesión iniciada correctamente\n');
    
    // Ejecutar búsquedas
    for (const test of TEST_QUERIES) {
      validationResults.total++;
      
      const result = await searchOpportunities(token, test.query, test.minResults);
      
      validationResults.details.push({
        ...result,
        description: test.description,
        minResults: test.minResults
      });
      
      // Validar criterios
      const passed = result.meetsMinimum && result.itemsValid > 0 && result.success;
      
      if (passed) {
        validationResults.passed++;
        console.log(`\n   ✅ VALIDACIÓN PASADA para "${test.query}"`);
      } else {
        validationResults.failed++;
        console.log(`\n   ❌ VALIDACIÓN FALLIDA para "${test.query}"`);
        if (!result.meetsMinimum) {
          console.log(`      - No se alcanzó el mínimo de ${test.minResults} resultados (se encontraron ${result.itemsFound})`);
        }
        if (result.itemsValid === 0) {
          console.log(`      - No se encontraron productos válidos`);
        }
        if (!result.success) {
          console.log(`      - La búsqueda falló`);
        }
      }
    }
    
    // Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN DE VALIDACIÓN\n');
    console.log(`   Total de pruebas: ${validationResults.total}`);
    console.log(`   ✅ Pasadas: ${validationResults.passed}`);
    console.log(`   ❌ Fallidas: ${validationResults.failed}`);
    console.log(`   Porcentaje de éxito: ${((validationResults.passed / validationResults.total) * 100).toFixed(1)}%\n`);
    
    validationResults.details.forEach(detail => {
      console.log(`   ${detail.meetsMinimum && detail.itemsValid > 0 ? '✅' : '❌'} "${detail.query}":`);
      console.log(`      Resultados: ${detail.itemsFound}/${detail.minResults} (mínimo requerido)`);
      console.log(`      Válidos: ${detail.itemsValid}/${detail.itemsFound}`);
      console.log(`      Duración: ${detail.duration}ms`);
      console.log('');
    });
    
    // Conclusión
    if (validationResults.passed === validationResults.total) {
      console.log('✅ ✅ ✅ TODAS LAS VALIDACIONES PASARON ✅ ✅ ✅\n');
      console.log('🎉 La funcionalidad AI Opportunity Finder está completamente restaurada y operativa.\n');
      process.exit(0);
    } else {
      console.log('⚠️  ALGUNAS VALIDACIONES FALLARON ⚠️\n');
      console.log('Revisa los detalles arriba para identificar los problemas.\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Error fatal en validación:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar validación
validateOpportunityFinder();

