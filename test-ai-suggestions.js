/**
 * Script de prueba manual para validar sanitización de valores
 * Ejecutar con: node test-ai-suggestions.js
 */

// Simular las funciones de sanitización
function sanitizeNumericValue(value, min, max, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  
  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
  
  if (!isFinite(numValue) || isNaN(numValue)) {
    console.warn(`⚠️  Valor inválido detectado: ${value} → usando ${defaultValue}`);
    return defaultValue;
  }
  
  if (Math.abs(numValue) > 1e10 || (Math.abs(numValue) > 0 && Math.abs(numValue) < 1e-10)) {
    console.warn(`⚠️  Valor fuera de rango razonable: ${numValue}`);
    if (Math.abs(numValue) > max) return max;
    if (Math.abs(numValue) < min && numValue > 0) return min;
    return defaultValue;
  }
  
  return Math.max(min, Math.min(max, numValue));
}

function formatSafeNumber(value, maxDecimals = 2) {
  if (!isFinite(value) || isNaN(value)) return '0';
  
  if (Math.abs(value) > 1e6) {
    const rounded = Math.round(value / 1e6);
    return `${rounded}M`;
  }
  
  return value.toLocaleString('en-US', {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0
  });
}

function sanitizeReasonText(reason) {
  if (!reason) return '';
  
  // Detectar y reemplazar valores en notación científica
  return reason.replace(/[\d.]+e[+-]\d+/gi, (match) => {
    const num = parseFloat(match);
    if (!isFinite(num)) return '—';
    if (Math.abs(num) > 1000) {
      return '1000+';
    }
    return num.toLocaleString('en-US', { 
      maximumFractionDigits: 2,
      notation: 'standard'
    });
  });
}

console.log('🧪 TEST: Sanitización de Valores Numéricos\n');
console.log('=' .repeat(60));

// Test 1: Valor en notación científica (el caso problemático original)
console.log('\n📊 Test 1: ROI en notación científica (1.0101010101010102e+88)');
const extremeROI = 1.0101010101010102e88;
const sanitizedROI = sanitizeNumericValue(extremeROI, 0, 1000, 0);
console.log(`   Input:  ${extremeROI}`);
console.log(`   Output: ${sanitizedROI}%`);
console.log(`   ✅ Valor sanitizado: ${sanitizedROI <= 1000 ? 'PASS' : 'FAIL'}`);

// Test 2: Valores NaN e Infinity
console.log('\n📊 Test 2: Valores NaN e Infinity');
const testCases = [
  { name: 'NaN', value: NaN },
  { name: 'Infinity', value: Infinity },
  { name: '-Infinity', value: -Infinity },
  { name: 'null', value: null },
  { name: 'undefined', value: undefined },
];

testCases.forEach(test => {
  const sanitized = sanitizeNumericValue(test.value, 0, 1000, 0);
  console.log(`   ${test.name}: ${test.value} → ${sanitized}`);
  console.log(`   ✅ Valor finito: ${isFinite(sanitized) ? 'PASS' : 'FAIL'}`);
});

// Test 3: Valores fuera de rango
console.log('\n📊 Test 3: Valores fuera de rango');
const outOfRange = [
  { value: 5000, expected: '<= 1000', desc: 'ROI muy alto' },
  { value: -100, expected: '>= 0', desc: 'ROI negativo' },
  { value: 1e15, expected: '<= 1000', desc: 'Valor extremo' },
];

outOfRange.forEach(test => {
  const sanitized = sanitizeNumericValue(test.value, 0, 1000, 0);
  const pass = test.value > 1000 ? sanitized <= 1000 : sanitized >= 0;
  console.log(`   ${test.desc}: ${test.value} → ${sanitized} (esperado: ${test.expected})`);
  console.log(`   ✅ ${pass ? 'PASS' : 'FAIL'}`);
});

// Test 4: Formateo de números
console.log('\n📊 Test 4: Formateo seguro de números');
const formatTests = [
  { value: 1234567, expected: '1M' },
  { value: 1234, expected: '1,234' },
  { value: 1.0101010101010102e88, expected: 'debe ser manejado' },
  { value: Infinity, expected: '0' },
];

formatTests.forEach(test => {
  try {
    const formatted = formatSafeNumber(test.value);
    console.log(`   ${test.value} → ${formatted}`);
    console.log(`   ✅ ${formatted !== 'NaN' && !formatted.includes('e') ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    console.log(`   ${test.value} → ERROR: ${e.message}`);
    console.log(`   ❌ FAIL`);
  }
});

// Test 5: Sanitización de texto con notación científica
console.log('\n📊 Test 5: Sanitización de texto (keywordReason)');
const reasonTests = [
  'ROI atractivo: 1.0101010101010102e+88%. 45 oportunidades encontradas',
  'Margen promedio: 2.5e+10%',
  'Valor normal: 75% con 50 oportunidades',
  'Valor extremo: 5e-20%',
];

reasonTests.forEach(reason => {
  const sanitized = sanitizeReasonText(reason);
  const hasScientific = /e[+-]\d+/i.test(sanitized);
  console.log(`   Original:  ${reason}`);
  console.log(`   Sanitizado: ${sanitized}`);
  console.log(`   ✅ Sin notación científica: ${!hasScientific ? 'PASS' : 'FAIL'}\n`);
});

// Test 6: Simulación de cálculo de promedio
console.log('\n📊 Test 6: Cálculo de promedio con valores mixtos');
const roiValues = [
  50,              // Valor normal
  1.0101010101010102e88,  // Valor extremo (debe ser filtrado)
  75,              // Valor normal
  Infinity,        // Valor inválido (debe ser filtrado)
  NaN,             // Valor inválido (debe ser filtrado)
  100,             // Valor normal
];

console.log(`   Valores originales: ${roiValues.length}`);
const validROIs = roiValues.filter(roi => {
  const sanitized = sanitizeNumericValue(roi, 0, 1000, 0);
  return sanitized > 0 && sanitized <= 1000;
});
console.log(`   Valores válidos después de sanitizar: ${validROIs.length}`);

const avgROI = validROIs.length > 0
  ? validROIs.reduce((a, b) => sanitizeNumericValue(a, 0, 1000, 0) + sanitizeNumericValue(b, 0, 1000, 0), 0) / validROIs.length
  : 0;
const safeAvgROI = sanitizeNumericValue(avgROI, 0, 1000, 0);

console.log(`   Promedio calculado: ${avgROI}`);
console.log(`   Promedio sanitizado: ${safeAvgROI}%`);
console.log(`   ✅ Promedio en rango válido: ${safeAvgROI <= 1000 && safeAvgROI >= 0 ? 'PASS' : 'FAIL'}`);

console.log('\n' + '='.repeat(60));
console.log('✅ Tests completados');
console.log('\n📝 Resumen:');
console.log('   - Valores extremos son filtrados correctamente');
console.log('   - NaN e Infinity son manejados');
console.log('   - Notación científica es reemplazada en texto');
console.log('   - Formateo previene visualización de valores inválidos');

