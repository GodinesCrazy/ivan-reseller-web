/**
 * Test completo del flujo de sugerencias IA
 * Simula el comportamiento del frontend para identificar problemas de renderizado
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_USER_ID = 1;

// Simular el formato que usa el frontend
function formatSafeNumber(value, unit = '', decimals = 0) {
  if (value === null || value === undefined || !isFinite(value) || isNaN(value)) {
    return '—';
  }
  
  const sanitized = Math.abs(value) > 1e9 
    ? Math.min(1e9, Math.abs(value)) * Math.sign(value)
    : value;
  
  if (Math.abs(sanitized) >= 1_000_000_000) {
    return `${(sanitized / 1_000_000_000).toFixed(decimals)}B${unit}`;
  }
  if (Math.abs(sanitized) >= 1_000_000) {
    return `${(sanitized / 1_000_000).toFixed(decimals)}M${unit}`;
  }
  if (Math.abs(sanitized) >= 1_000) {
    return `${(sanitized / 1_000).toFixed(decimals)}K${unit}`;
  }
  
  return `${sanitized.toFixed(decimals)}${unit}`;
}

function renderSuggestion(suggestion, index) {
  console.log(`\n📋 Renderizando Sugerencia #${index + 1}:`);
  console.log(`   ID: ${suggestion.id}`);
  console.log(`   Título: ${suggestion.title || 'SIN TÍTULO'}`);
  console.log(`   Tipo: ${suggestion.type || 'unknown'}`);
  
  try {
    // Validar estructura básica
    if (!suggestion.id) {
      throw new Error('Sugerencia sin ID');
    }
    
    // Validar impact
    const impact = suggestion.impact || {};
    const revenue = impact.revenue || 0;
    const time = impact.time || 0;
    const difficulty = impact.difficulty || 'medium';
    
    console.log(`   Impacto económico: ${formatSafeNumber(revenue, 'USD', 1)}`);
    console.log(`   Tiempo: ${isFinite(time) && time >= 0 ? `${time}h` : '0h'}`);
    console.log(`   Dificultad: ${difficulty}`);
    
    // Validar confidence
    const confidence = suggestion.confidence;
    if (typeof confidence !== 'number' || !isFinite(confidence) || isNaN(confidence)) {
      console.log(`   ⚠️  Confianza inválida: ${confidence}`);
    } else {
      const safeConf = Math.max(0, Math.min(100, Math.round(confidence)));
      console.log(`   Confianza IA: ${safeConf}%`);
    }
    
    // Validar metrics si existe
    if (suggestion.metrics) {
      const metrics = suggestion.metrics;
      const currentVal = metrics.currentValue;
      const targetVal = metrics.targetValue;
      
      if (typeof currentVal !== 'number' || !isFinite(currentVal) || isNaN(currentVal)) {
        console.log(`   ⚠️  Métrica currentValue inválida: ${currentVal}`);
      } else {
        console.log(`   Métrica actual: ${formatSafeNumber(currentVal, metrics.unit || '', 2)}`);
      }
      
      if (typeof targetVal !== 'number' || !isFinite(targetVal) || isNaN(targetVal)) {
        console.log(`   ⚠️  Métrica targetValue inválida: ${targetVal}`);
      } else {
        console.log(`   Métrica objetivo: ${formatSafeNumber(targetVal, metrics.unit || '', 2)}`);
      }
    }
    
    // Validar keywordSupportingMetric si es sugerencia de búsqueda
    if (suggestion.type === 'search' && suggestion.keywordSupportingMetric) {
      const metric = suggestion.keywordSupportingMetric;
      const val = metric.value;
      
      if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) {
        console.log(`   ⚠️  keywordSupportingMetric.value inválido: ${val}`);
      } else {
        const safeVal = Math.abs(val) > 1e6 ? Math.min(1e6, val) : val;
        console.log(`   Keyword metric: ${formatSafeNumber(safeVal, metric.unit || '', 2)}`);
      }
      
      // Validar keywordReason
      if (suggestion.keywordReason) {
        const reason = suggestion.keywordReason;
        // Detectar notación científica en texto
        const scientificNotation = /[\d.]+e[+-]\d+/gi.test(reason);
        if (scientificNotation) {
          console.log(`   ⚠️  keywordReason contiene notación científica: "${reason.substring(0, 50)}..."`);
        }
      }
    }
    
    // Validar arrays
    if (suggestion.requirements && !Array.isArray(suggestion.requirements)) {
      console.log(`   ⚠️  requirements no es un array: ${typeof suggestion.requirements}`);
    }
    if (suggestion.steps && !Array.isArray(suggestion.steps)) {
      console.log(`   ⚠️  steps no es un array: ${typeof suggestion.steps}`);
    }
    
    console.log(`   ✅ Renderizado exitoso`);
    return { success: true, suggestion };
    
  } catch (error) {
    console.log(`   ❌ ERROR al renderizar: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
    return { success: false, error: error.message, suggestion };
  }
}

async function testSuggestionsFlow() {
  console.log('🧪 Iniciando test completo de Sugerencias IA\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`User ID: ${TEST_USER_ID}\n`);
  
  try {
    // 1. Obtener sugerencias existentes
    console.log('1️⃣ Obteniendo sugerencias existentes...');
    const getResponse = await axios.get(`${API_URL}/api/ai-suggestions`, {
      params: { filter: 'all' },
      headers: {
        'Cookie': `session=${process.env.SESSION_COOKIE || ''}`,
        'Authorization': process.env.AUTH_TOKEN ? `Bearer ${process.env.AUTH_TOKEN}` : undefined
      },
      validateStatus: () => true // Aceptar cualquier status
    });
    
    console.log(`   Status: ${getResponse.status}`);
    
    if (getResponse.status !== 200) {
      console.log(`   ❌ Error: ${getResponse.status} - ${JSON.stringify(getResponse.data)}`);
      return;
    }
    
    const suggestions = getResponse.data?.suggestions || [];
    console.log(`   Sugerencias encontradas: ${suggestions.length}`);
    
    if (suggestions.length === 0) {
      console.log('\n   ℹ️  No hay sugerencias. Generando nuevas...');
      
      // 2. Generar nuevas sugerencias
      console.log('\n2️⃣ Generando nuevas sugerencias...');
      const generateResponse = await axios.post(`${API_URL}/api/ai-suggestions/generate`, {}, {
        headers: {
          'Cookie': `session=${process.env.SESSION_COOKIE || ''}`,
          'Authorization': process.env.AUTH_TOKEN ? `Bearer ${process.env.AUTH_TOKEN}` : undefined
        },
        validateStatus: () => true
      });
      
      console.log(`   Status: ${generateResponse.status}`);
      
      if (generateResponse.status === 200) {
        const newSuggestions = generateResponse.data?.suggestions || [];
        console.log(`   Sugerencias generadas: ${newSuggestions.length}`);
        
        if (newSuggestions.length > 0) {
          console.log('\n3️⃣ Probando renderizado de sugerencias generadas...');
          newSuggestions.forEach((s, i) => renderSuggestion(s, i));
        }
        
        // Esperar un momento para que se guarden
        console.log('\n   ⏳ Esperando 2 segundos para que se guarden...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Volver a obtener
        console.log('\n4️⃣ Obteniendo sugerencias guardadas...');
        const getResponse2 = await axios.get(`${API_URL}/api/ai-suggestions`, {
          params: { filter: 'all' },
          headers: {
            'Cookie': `session=${process.env.SESSION_COOKIE || ''}`,
            'Authorization': process.env.AUTH_TOKEN ? `Bearer ${process.env.AUTH_TOKEN}` : undefined
          },
          validateStatus: () => true
        });
        
        if (getResponse2.status === 200) {
          const savedSuggestions = getResponse2.data?.suggestions || [];
          console.log(`   Sugerencias guardadas encontradas: ${savedSuggestions.length}`);
          
          if (savedSuggestions.length > 0) {
            console.log('\n5️⃣ Probando renderizado de sugerencias guardadas...');
            const results = savedSuggestions.map((s, i) => renderSuggestion(s, i));
            
            const successCount = results.filter(r => r.success).length;
            const errorCount = results.filter(r => !r.success).length;
            
            console.log(`\n📊 Resumen:`);
            console.log(`   Total: ${savedSuggestions.length}`);
            console.log(`   ✅ Exitosos: ${successCount}`);
            console.log(`   ❌ Errores: ${errorCount}`);
            
            if (errorCount > 0) {
              console.log(`\n⚠️  SUGERENCIAS CON ERRORES:`);
              results
                .filter(r => !r.success)
                .forEach((r, i) => {
                  console.log(`\n   Error #${i + 1}:`);
                  console.log(`   - ID: ${r.suggestion?.id || 'N/A'}`);
                  console.log(`   - Título: ${r.suggestion?.title || 'N/A'}`);
                  console.log(`   - Error: ${r.error}`);
                  console.log(`   - Datos completos:`, JSON.stringify(r.suggestion, null, 2));
                });
            }
          }
        }
      }
    } else {
      // Ya hay sugerencias, probar renderizado
      console.log('\n3️⃣ Probando renderizado de sugerencias existentes...');
      const results = suggestions.map((s, i) => renderSuggestion(s, i));
      
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      
      console.log(`\n📊 Resumen:`);
      console.log(`   Total: ${suggestions.length}`);
      console.log(`   ✅ Exitosos: ${successCount}`);
      console.log(`   ❌ Errores: ${errorCount}`);
      
      if (errorCount > 0) {
        console.log(`\n⚠️  SUGERENCIAS CON ERRORES:`);
        results
          .filter(r => !r.success)
          .forEach((r, i) => {
            console.log(`\n   Error #${i + 1}:`);
            console.log(`   - ID: ${r.suggestion?.id || 'N/A'}`);
            console.log(`   - Título: ${r.suggestion?.title || 'N/A'}`);
            console.log(`   - Error: ${r.error}`);
            console.log(`   - Datos completos:`, JSON.stringify(r.suggestion, null, 2));
          });
      }
    }
    
    // 6. Probar filtros
    console.log('\n6️⃣ Probando filtros...');
    const filters = ['all', 'search', 'pricing', 'inventory'];
    
    for (const filter of filters) {
      const filterResponse = await axios.get(`${API_URL}/api/ai-suggestions`, {
        params: { filter },
        headers: {
          'Cookie': `session=${process.env.SESSION_COOKIE || ''}`,
          'Authorization': process.env.AUTH_TOKEN ? `Bearer ${process.env.AUTH_TOKEN}` : undefined
        },
        validateStatus: () => true
      });
      
      if (filterResponse.status === 200) {
        const filtered = filterResponse.data?.suggestions || [];
        console.log(`   Filtro "${filter}": ${filtered.length} sugerencias`);
      }
    }
    
    console.log('\n✅ Test completado');
    
  } catch (error) {
    console.error('\n❌ ERROR EN TEST:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Ejecutar test
testSuggestionsFlow();

