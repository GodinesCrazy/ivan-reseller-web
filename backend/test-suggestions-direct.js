/**
 * Test directo del servicio de sugerencias IA
 * Se ejecuta dentro del contexto del backend
 */

const { AISuggestionsService } = require('./dist/services/ai-suggestions.service');
const { logger } = require('./dist/config/logger');

// Función para formatear números de forma segura (simula frontend)
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
    
    // Validar time
    const timeValue = typeof time === 'number' && isFinite(time) && time >= 0 ? time : 0;
    console.log(`   Tiempo: ${timeValue}h`);
    console.log(`   Dificultad: ${difficulty}`);
    
    // Validar confidence
    const confidence = suggestion.confidence;
    if (typeof confidence !== 'number' || !isFinite(confidence) || isNaN(confidence)) {
      console.log(`   ⚠️  Confianza inválida: ${JSON.stringify(confidence)} (tipo: ${typeof confidence})`);
    } else {
      const safeConf = Math.max(0, Math.min(100, Math.round(confidence)));
      console.log(`   Confianza IA: ${safeConf}%`);
      
      if (confidence !== safeConf) {
        console.log(`   ⚠️  Confianza ajustada de ${confidence} a ${safeConf}`);
      }
    }
    
    // Validar metrics si existe
    if (suggestion.metrics) {
      const metrics = suggestion.metrics;
      const currentVal = metrics.currentValue;
      const targetVal = metrics.targetValue;
      
      if (typeof currentVal !== 'number' || !isFinite(currentVal) || isNaN(currentVal)) {
        console.log(`   ⚠️  Métrica currentValue inválida: ${JSON.stringify(currentVal)} (tipo: ${typeof currentVal})`);
      } else {
        const formatted = formatSafeNumber(currentVal, metrics.unit || '', 2);
        console.log(`   Métrica actual: ${formatted}`);
        
        if (Math.abs(currentVal) > 1e6) {
          console.log(`   ⚠️  Valor muy grande: ${currentVal}`);
        }
      }
      
      if (typeof targetVal !== 'number' || !isFinite(targetVal) || isNaN(targetVal)) {
        console.log(`   ⚠️  Métrica targetValue inválida: ${JSON.stringify(targetVal)} (tipo: ${typeof targetVal})`);
      } else {
        const formatted = formatSafeNumber(targetVal, metrics.unit || '', 2);
        console.log(`   Métrica objetivo: ${formatted}`);
        
        if (Math.abs(targetVal) > 1e6) {
          console.log(`   ⚠️  Valor muy grande: ${targetVal}`);
        }
      }
    }
    
    // Validar keywordSupportingMetric si es sugerencia de búsqueda
    if (suggestion.type === 'search' && suggestion.keywordSupportingMetric) {
      const metric = suggestion.keywordSupportingMetric;
      const val = metric.value;
      
      if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) {
        console.log(`   ⚠️  keywordSupportingMetric.value inválido: ${JSON.stringify(val)} (tipo: ${typeof val})`);
      } else {
        const safeVal = Math.abs(val) > 1e6 ? Math.min(1e6, val) : val;
        console.log(`   Keyword metric: ${formatSafeNumber(safeVal, metric.unit || '', 2)}`);
        
        if (Math.abs(val) > 1e6) {
          console.log(`   ⚠️  Valor muy grande ajustado: ${val} → ${safeVal}`);
        }
      }
      
      // Validar keywordReason
      if (suggestion.keywordReason) {
        const reason = String(suggestion.keywordReason);
        // Detectar notación científica en texto
        const scientificNotation = /[\d.]+e[+-]\d+/gi.test(reason);
        if (scientificNotation) {
          console.log(`   ⚠️  keywordReason contiene notación científica:`);
          console.log(`       "${reason.substring(0, 100)}${reason.length > 100 ? '...' : ''}"`);
        }
      }
    }
    
    // Validar arrays
    if (suggestion.requirements !== undefined && !Array.isArray(suggestion.requirements)) {
      console.log(`   ⚠️  requirements no es un array: ${typeof suggestion.requirements}`);
      console.log(`       Valor: ${JSON.stringify(suggestion.requirements)}`);
    }
    if (suggestion.steps !== undefined && !Array.isArray(suggestion.steps)) {
      console.log(`   ⚠️  steps no es un array: ${typeof suggestion.steps}`);
      console.log(`       Valor: ${JSON.stringify(suggestion.steps)}`);
    }
    
    // Validar campos opcionales
    if (suggestion.relatedProducts !== undefined && !Array.isArray(suggestion.relatedProducts) && suggestion.relatedProducts !== null) {
      console.log(`   ⚠️  relatedProducts no es array ni null: ${typeof suggestion.relatedProducts}`);
    }
    
    // Validar targetMarketplaces
    if (suggestion.targetMarketplaces !== undefined && !Array.isArray(suggestion.targetMarketplaces)) {
      console.log(`   ⚠️  targetMarketplaces no es un array: ${typeof suggestion.targetMarketplaces}`);
    }
    
    console.log(`   ✅ Renderizado exitoso`);
    return { success: true, suggestion };
    
  } catch (error) {
    console.log(`   ❌ ERROR al renderizar: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
    console.log(`   Sugerencia completa:`, JSON.stringify(suggestion, null, 2));
    return { success: false, error: error.message, suggestion };
  }
}

async function testSuggestionsService() {
  console.log('🧪 Test directo del servicio de Sugerencias IA\n');
  
  try {
    const service = new AISuggestionsService();
    const userId = 1;
    
    // 1. Obtener sugerencias existentes
    console.log('1️⃣ Obteniendo sugerencias existentes...');
    const existingSuggestions = await service.getSuggestions(userId);
    console.log(`   Sugerencias encontradas: ${existingSuggestions.length}`);
    
    if (existingSuggestions.length > 0) {
      console.log('\n2️⃣ Probando renderizado de sugerencias existentes...');
      const results = existingSuggestions.map((s, i) => renderSuggestion(s, i));
      
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      
      console.log(`\n📊 Resumen:`);
      console.log(`   Total: ${existingSuggestions.length}`);
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
          });
      }
      
      // Analizar tipos de datos
      console.log('\n📈 Análisis de datos:');
      const types = {};
      existingSuggestions.forEach(s => {
        types[s.type] = (types[s.type] || 0) + 1;
      });
      console.log('   Tipos de sugerencias:', types);
      
      // Detectar valores problemáticos
      console.log('\n🔍 Detectando valores problemáticos...');
      let problematicCount = 0;
      
      existingSuggestions.forEach((s, i) => {
        const issues = [];
        
        // Revisar confidence
        if (typeof s.confidence !== 'number' || !isFinite(s.confidence) || isNaN(s.confidence)) {
          issues.push(`confidence inválido: ${s.confidence}`);
        } else if (s.confidence < 0 || s.confidence > 100) {
          issues.push(`confidence fuera de rango: ${s.confidence}`);
        }
        
        // Revisar impact.revenue
        if (s.impact?.revenue !== undefined) {
          if (typeof s.impact.revenue !== 'number' || !isFinite(s.impact.revenue) || isNaN(s.impact.revenue)) {
            issues.push(`impact.revenue inválido: ${s.impact.revenue} (tipo: ${typeof s.impact.revenue})`);
          } else if (Math.abs(s.impact.revenue) > 1e10) {
            issues.push(`impact.revenue muy grande: ${s.impact.revenue}`);
          }
          // ✅ NO es un problema si es un número finito y razonable (0 a 1e10)
        }
        
        // Revisar impact.time
        if (s.impact?.time !== undefined) {
          if (typeof s.impact.time !== 'number' || !isFinite(s.impact.time) || isNaN(s.impact.time)) {
            issues.push(`impact.time inválido: ${s.impact.time}`);
          }
        }
        
        // Revisar metrics
        if (s.metrics) {
          if (s.metrics.currentValue !== undefined) {
            if (typeof s.metrics.currentValue !== 'number' || !isFinite(s.metrics.currentValue) || isNaN(s.metrics.currentValue)) {
              issues.push(`metrics.currentValue inválido: ${s.metrics.currentValue}`);
            }
          }
          if (s.metrics.targetValue !== undefined) {
            if (typeof s.metrics.targetValue !== 'number' || !isFinite(s.metrics.targetValue) || isNaN(s.metrics.targetValue)) {
              issues.push(`metrics.targetValue inválido: ${s.metrics.targetValue}`);
            }
          }
        }
        
        // Revisar keywordSupportingMetric
        if (s.keywordSupportingMetric) {
          if (typeof s.keywordSupportingMetric.value !== 'number' || !isFinite(s.keywordSupportingMetric.value) || isNaN(s.keywordSupportingMetric.value)) {
            issues.push(`keywordSupportingMetric.value inválido: ${s.keywordSupportingMetric.value}`);
          }
        }
        
        if (issues.length > 0) {
          problematicCount++;
          console.log(`\n   Sugerencia #${i + 1} (ID: ${s.id}):`);
          issues.forEach(issue => console.log(`     ⚠️  ${issue}`));
        }
      });
      
      if (problematicCount === 0) {
        console.log('   ✅ No se detectaron valores problemáticos');
      } else {
        console.log(`\n   ⚠️  Total de sugerencias con problemas: ${problematicCount}`);
      }
    } else {
      console.log('\n   ℹ️  No hay sugerencias. Generando nuevas...');
      
      // 2. Generar nuevas sugerencias
      console.log('\n2️⃣ Generando nuevas sugerencias...');
      const newSuggestions = await service.generateSuggestions(userId);
      console.log(`   Sugerencias generadas: ${newSuggestions.length}`);
      
      if (newSuggestions.length > 0) {
        console.log('\n3️⃣ Probando renderizado de sugerencias generadas...');
        const results = newSuggestions.map((s, i) => renderSuggestion(s, i));
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;
        
        console.log(`\n📊 Resumen:`);
        console.log(`   Total: ${newSuggestions.length}`);
        console.log(`   ✅ Exitosos: ${successCount}`);
        console.log(`   ❌ Errores: ${errorCount}`);
      }
    }
    
    // 3. Probar filtros
    console.log('\n3️⃣ Probando filtros...');
    const filters = ['all', 'search', 'pricing', 'inventory', 'listing'];
    
    for (const filter of filters) {
      const filtered = await service.getSuggestions(userId, filter);
      console.log(`   Filtro "${filter}": ${filtered.length} sugerencias`);
    }
    
    console.log('\n✅ Test completado exitosamente');
    
  } catch (error) {
    console.error('\n❌ ERROR EN TEST:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Ejecutar test
testSuggestionsService()
  .then(() => {
    console.log('\n🎉 Test finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  });

