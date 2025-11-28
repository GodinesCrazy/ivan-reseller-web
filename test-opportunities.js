/**
 * Script simple para verificar si findOpportunities retorna oportunidades
 * Ejecutar: node test-opportunities.js
 */

// Simular el comportamiento básico del sistema
console.log('🧪 Verificando si el sistema retorna oportunidades...\n');

// Importar dinámicamente después de compilar
const path = require('path');
const fs = require('fs');

// Verificar si el código compilado existe
const distPath = path.join(__dirname, 'backend', 'dist', 'services', 'opportunity-finder.service.js');

if (fs.existsSync(distPath)) {
  console.log('✅ Código compilado encontrado');
  console.log('📋 Para probar el sistema real, ejecuta:');
  console.log('   npm run build');
  console.log('   node backend/dist/scripts/test-find-opportunities-simple.js\n');
} else {
  console.log('⚠️  Código compilado no encontrado');
  console.log('📋 Necesitas compilar primero:\n');
  console.log('   cd backend');
  console.log('   npm run build\n');
}

console.log('🔍 Revisando logs recientes para ver si hay búsquedas...');

// Intentar leer el log más reciente
const logFiles = fs.readdirSync(__dirname).filter(f => f.startsWith('logs.') && f.endsWith('.log'));
if (logFiles.length > 0) {
  const latestLog = logFiles.sort().reverse()[0];
  console.log(`\n📄 Log más reciente: ${latestLog}`);
  
  const logContent = fs.readFileSync(latestLog, 'utf8');
  
  // Buscar indicadores de búsqueda de oportunidades
  const hasOpportunitiesSearch = logContent.includes('Búsqueda de oportunidades');
  const hasScrapingSuccess = logContent.includes('Scraping nativo exitoso') || logContent.includes('Productos encontrados');
  const hasNoProducts = logContent.includes('No se encontraron productos') || logContent.includes('retornó vacío');
  const hasBlocking = logContent.includes('punish') || logContent.includes('bloqueado');
  
  console.log('\n📊 Análisis del log:');
  console.log(`   ${hasOpportunitiesSearch ? '✅' : '❌'} Búsqueda de oportunidades: ${hasOpportunitiesSearch ? 'Sí' : 'No'}`);
  console.log(`   ${hasScrapingSuccess ? '✅' : '❌'} Scraping exitoso: ${hasScrapingSuccess ? 'Sí' : 'No'}`);
  console.log(`   ${hasNoProducts ? '⚠️' : '✅'} Sin productos: ${hasNoProducts ? 'Sí' : 'No'}`);
  console.log(`   ${hasBlocking ? '⚠️' : '✅'} Bloqueo detectado: ${hasBlocking ? 'Sí' : 'No'}`);
  
  if (hasNoProducts && hasBlocking) {
    console.log('\n❌ PROBLEMA: AliExpress está bloqueando y no se encuentran productos');
    console.log('   Solución: Configurar ScraperAPI/ZenRows o usar cookies válidas');
  } else if (hasScrapingSuccess) {
    console.log('\n✅ El scraping está funcionando correctamente');
  } else if (hasNoProducts) {
    console.log('\n⚠️  El scraper no está encontrando productos (posible bloqueo)');
  }
}

console.log('\n💡 Para una verificación completa, ejecuta el servidor y prueba desde la UI');

