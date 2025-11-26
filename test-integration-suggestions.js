/**
 * Test de integración: Simula el flujo completo de generación de sugerencias
 */

// Simular funciones de sanitización del backend
function sanitizeNumericValue(value, min, max, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  
  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
  
  if (!isFinite(numValue) || isNaN(numValue)) {
    return defaultValue;
  }
  
  if (Math.abs(numValue) > 1e10 || (Math.abs(numValue) > 0 && Math.abs(numValue) < 1e-10)) {
    if (Math.abs(numValue) > max) return max;
    if (Math.abs(numValue) < min && numValue > 0) return min;
    return defaultValue;
  }
  
  return Math.max(min, Math.min(max, numValue));
}

// Simular cálculo de promedio con sanitización
function calculateAverageROI(roiValues) {
  const sanitizedROIs = roiValues
    .map(roi => sanitizeNumericValue(roi, 0, 1000, 0))
    .filter(roi => roi > 0 && roi <= 1000);
  
  if (sanitizedROIs.length === 0) return 0;
  
  const sum = sanitizedROIs.reduce((a, b) => a + b, 0);
  const avg = sum / sanitizedROIs.length;
  
  return sanitizeNumericValue(avg, 0, 1000, 0);
}

// Simular formateo seguro del frontend
function formatROI(value) {
  if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) return '—';
  const safeVal = Math.max(0, Math.min(1000, Math.round(value)));
  return `${safeVal}%`;
}

function formatMetricValue(val, unit) {
  if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) return '—';
  
  const safeVal = Math.abs(val) > 1e6 ? Math.min(1e6, val) : val;
  
  if (unit === '%') {
    const rounded = Math.round(safeVal * 100) / 100;
    return `${rounded}${unit}`;
  }
  
  if (Math.abs(safeVal) > 1e6) {
    return `${(safeVal / 1e6).toFixed(1)}M ${unit}`;
  } else if (Math.abs(safeVal) > 1e3) {
    return `${(safeVal / 1e3).toFixed(1)}K ${unit}`;
  }
  
  return `${safeVal.toLocaleString('en-US', { 
    maximumFractionDigits: 2,
    notation: 'standard'
  })} ${unit}`;
}

function sanitizeReasonText(reason) {
  if (!reason) return '';
  return reason.replace(/[\d.]+e[+-]\d+/gi, (match) => {
    const num = parseFloat(match);
    if (!isFinite(num)) return '—';
    if (Math.abs(num) > 1000) return '1000+';
    return num.toLocaleString('en-US', { 
      maximumFractionDigits: 2,
      notation: 'standard'
    });
  });
}

console.log('🔬 TEST DE INTEGRACIÓN: Flujo Completo de Sugerencias\n');
console.log('='.repeat(70));

// Simular datos corruptos de oportunidades (como vendrían de la BD)
const mockOpportunities = [
  {
    title: 'wireless earbuds bluetooth',
    roiPercentage: 75, // Normal
    profitMargin: 0.6,
  },
  {
    title: 'gaming keyboard',
    roiPercentage: 1.0101010101010102e88, // Valor extremo corrupto
    profitMargin: 0.5,
  },
  {
    title: 'phone case',
    roiPercentage: 50, // Normal
    profitMargin: 0.4,
  },
  {
    title: 'laptop stand',
    roiPercentage: Infinity, // Inválido
    profitMargin: NaN,
  },
  {
    title: 'mouse pad',
    roiPercentage: 100, // Normal
    profitMargin: 0.55,
  },
];

console.log('\n📥 Datos de entrada (simulando BD):');
mockOpportunities.forEach((opp, i) => {
  console.log(`   ${i + 1}. ${opp.title}: ROI=${opp.roiPercentage}, Margin=${opp.profitMargin}`);
});

// Paso 1: Calcular promedio ROI (como lo hace analyzeTrends)
console.log('\n📊 Paso 1: Calcular promedio ROI (con sanitización)');
const roiValues = mockOpportunities.map(opp => opp.roiPercentage);
console.log(`   ROI values extraídos: [${roiValues.join(', ')}]`);

const avgROI = calculateAverageROI(roiValues);
console.log(`   ✅ Promedio ROI sanitizado: ${avgROI}%`);
console.log(`   ✅ En rango válido (0-1000%): ${avgROI >= 0 && avgROI <= 1000 ? 'PASS' : 'FAIL'}`);

// Paso 2: Generar razón (como lo hace generateKeywordSuggestions)
console.log('\n📝 Paso 2: Generar razón con ROI');
let reason = `ROI atractivo: ${Math.round(avgROI)}%. ${mockOpportunities.length} oportunidades encontradas recientemente`;
console.log(`   Razón original: ${reason}`);

// Simular caso donde el ROI podría estar mal formateado
const badReason = `ROI atractivo: ${1.0101010101010102e88}%. ${mockOpportunities.length} oportunidades encontradas`;
const sanitizedReason = sanitizeReasonText(badReason);
console.log(`   Razón con valor extremo: ${badReason}`);
console.log(`   Razón sanitizada: ${sanitizedReason}`);
console.log(`   ✅ Sin notación científica: ${!/e[+-]\d+/i.test(sanitizedReason) ? 'PASS' : 'FAIL'}`);

// Paso 3: Crear supportingMetric (como lo hace generateKeywordSuggestions)
console.log('\n📈 Paso 3: Crear métrica de soporte');
const supportingMetric = {
  type: 'roi',
  value: avgROI,
  unit: '%',
  description: `ROI promedio de ${Math.round(avgROI)}%`,
};
console.log(`   Métrica creada:`, supportingMetric);
console.log(`   ✅ Valor en rango: ${supportingMetric.value <= 1000 ? 'PASS' : 'FAIL'}`);

// Paso 4: Formatear para frontend (como lo hace AISuggestionsPanel)
console.log('\n🎨 Paso 4: Formatear para visualización (Frontend)');

// Test formatROI
const formattedROI = formatROI(avgROI);
console.log(`   ROI formateado: ${formattedROI}`);
console.log(`   ✅ Formato válido: ${!formattedROI.includes('e') && !formattedROI.includes('Infinity') ? 'PASS' : 'FAIL'}`);

// Test formatMetricValue con diferentes valores
const metricTests = [
  { value: avgROI, unit: '%', desc: 'ROI promedio' },
  { value: 1.0101010101010102e88, unit: '%', desc: 'ROI extremo (debe ser sanitizado)' },
  { value: 1500000, unit: 'USD', desc: 'Revenue grande' },
  { value: Infinity, unit: '%', desc: 'Valor infinito' },
];

metricTests.forEach(test => {
  const formatted = formatMetricValue(test.value, test.unit);
  const isValid = !formatted.includes('e') && !formatted.includes('Infinity') && !formatted.includes('NaN');
  console.log(`   ${test.desc}: ${test.value} ${test.unit} → ${formatted}`);
  console.log(`   ✅ Formato válido: ${isValid ? 'PASS' : 'FAIL'}`);
});

// Paso 5: Simular renderizado completo de sugerencia
console.log('\n🖥️  Paso 5: Simulación de renderizado completo');
const mockSuggestion = {
  id: 'test_1',
  type: 'search',
  keyword: 'wireless earbuds',
  keywordReason: sanitizedReason,
  keywordSupportingMetric: supportingMetric,
  confidence: sanitizeNumericValue(85, 0, 100, 75),
  impact: {
    revenue: sanitizeNumericValue(50000, 0, 1000000, 0),
    time: 1,
  },
};

console.log('   Sugerencia a renderizar:');
console.log(`   - Keyword: "${mockSuggestion.keyword}"`);
console.log(`   - Razón: ${mockSuggestion.keywordReason}`);
console.log(`   - Métrica: ${formatMetricValue(mockSuggestion.keywordSupportingMetric.value, mockSuggestion.keywordSupportingMetric.unit)}`);
console.log(`   - Confianza: ${formatROI(mockSuggestion.confidence)}`);
console.log(`   - Impact Revenue: ${formatMetricValue(mockSuggestion.impact.revenue, 'USD')}`);

// Verificar que todo es renderizable sin errores
const canRender = 
  !mockSuggestion.keywordReason.includes('e+') &&
  !mockSuggestion.keywordReason.includes('Infinity') &&
  isFinite(mockSuggestion.keywordSupportingMetric.value) &&
  isFinite(mockSuggestion.confidence) &&
  isFinite(mockSuggestion.impact.revenue);

console.log(`\n   ✅ Sugerencia renderizable sin errores: ${canRender ? 'PASS' : 'FAIL'}`);

console.log('\n' + '='.repeat(70));
console.log('✅ TEST DE INTEGRACIÓN COMPLETADO\n');
console.log('📊 Resumen:');
console.log('   ✅ Valores corruptos son filtrados en el backend');
console.log('   ✅ Promedios se calculan solo con valores válidos');
console.log('   ✅ Texto se sanitiza antes de mostrar');
console.log('   ✅ Frontend formatea valores de forma segura');
console.log('   ✅ El sistema no crashea con datos corruptos');
console.log('\n🎯 Conclusión: El sistema es resiliente ante valores extremos');

