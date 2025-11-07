/**
 * Script para analizar logs del scraper y generar un reporte
 * 
 * Uso:
 *   npx ts-node scripts/analyze-scraper-logs.ts
 * 
 * O con logs de Railway:
 *   railway logs | npx ts-node scripts/analyze-scraper-logs.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface LogAnalysis {
  totalAttempts: number;
  successfulScrapes: number;
  failedScrapes: number;
  chromiumIssues: number;
  captchaIssues: number;
  selectorIssues: number;
  bridgePythonFallbacks: number;
  averageProductsFound: number;
  errors: string[];
  warnings: string[];
  recentLogs: string[];
}

function analyzeLogs(logContent: string): LogAnalysis {
  const lines = logContent.split('\n');
  const analysis: LogAnalysis = {
    totalAttempts: 0,
    successfulScrapes: 0,
    failedScrapes: 0,
    chromiumIssues: 0,
    captchaIssues: 0,
    selectorIssues: 0,
    bridgePythonFallbacks: 0,
    averageProductsFound: 0,
    errors: [],
    warnings: [],
    recentLogs: []
  };

  let productsFoundCount = 0;
  let productsFoundSum = 0;

  for (const line of lines) {
    // Contar intentos de scraping
    if (line.includes('🔍 Usando scraping nativo local (Puppeteer)') || 
        line.includes('Scraping REAL AliExpress')) {
      analysis.totalAttempts++;
    }

    // Contar éxitos
    if (line.includes('✅ Scraping nativo exitoso')) {
      analysis.successfulScrapes++;
      const match = line.match(/✅ Scraping nativo exitoso: (\d+) productos encontrados/);
      if (match) {
        productsFoundCount++;
        productsFoundSum += parseInt(match[1], 10);
      }
    }

    // Contar fallos
    if (line.includes('❌ Error en scraping nativo') || 
        line.includes('❌ Ambos métodos de scraping fallaron')) {
      analysis.failedScrapes++;
    }

    // Problemas con Chromium
    if (line.includes('Chromium del sistema no encontrado') ||
        line.includes('Error al iniciar navegador') ||
        line.includes('Failed to launch the browser process')) {
      analysis.chromiumIssues++;
    }

    // Problemas con CAPTCHA
    if (line.includes('CAPTCHA detectado') ||
        line.includes('CAPTCHA_REQUIRED')) {
      analysis.captchaIssues++;
    }

    // Problemas con selectores
    if (line.includes('No se encontraron productos con ningún selector') ||
        line.includes('selector incorrecto')) {
      analysis.selectorIssues++;
    }

    // Fallback a bridge Python
    if (line.includes('Scraping nativo falló, intentando bridge Python') ||
        line.includes('Bridge Python exitoso')) {
      analysis.bridgePythonFallbacks++;
    }

    // Capturar errores
    if (line.includes('❌') || line.includes('ERROR') || line.includes('Error')) {
      if (line.length < 200) { // Limitar tamaño
        analysis.errors.push(line.trim());
      }
    }

    // Capturar advertencias
    if (line.includes('⚠️') || line.includes('WARN')) {
      if (line.length < 200) {
        analysis.warnings.push(line.trim());
      }
    }

    // Guardar logs recientes (últimas 20 líneas relevantes)
    if (line.includes('scraping') || line.includes('Scraping') || 
        line.includes('Chromium') || line.includes('CAPTCHA')) {
      analysis.recentLogs.push(line.trim());
      if (analysis.recentLogs.length > 20) {
        analysis.recentLogs.shift();
      }
    }
  }

  // Calcular promedio de productos encontrados
  if (productsFoundCount > 0) {
    analysis.averageProductsFound = Math.round(productsFoundSum / productsFoundCount);
  }

  return analysis;
}

function printReport(analysis: LogAnalysis) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 REPORTE DE ANÁLISIS DEL SCRAPER');
  console.log('='.repeat(80) + '\n');

  // Estadísticas generales
  console.log('📈 ESTADÍSTICAS GENERALES:');
  console.log(`   Total de intentos: ${analysis.totalAttempts}`);
  console.log(`   ✅ Éxitos: ${analysis.successfulScrapes} (${analysis.totalAttempts > 0 ? Math.round((analysis.successfulScrapes / analysis.totalAttempts) * 100) : 0}%)`);
  console.log(`   ❌ Fallos: ${analysis.failedScrapes} (${analysis.totalAttempts > 0 ? Math.round((analysis.failedScrapes / analysis.totalAttempts) * 100) : 0}%)`);
  console.log(`   📦 Promedio de productos encontrados: ${analysis.averageProductsFound}\n`);

  // Problemas detectados
  console.log('⚠️  PROBLEMAS DETECTADOS:');
  console.log(`   🔧 Problemas con Chromium: ${analysis.chromiumIssues}`);
  console.log(`   🛡️  Problemas con CAPTCHA: ${analysis.captchaIssues}`);
  console.log(`   🎯 Problemas con selectores: ${analysis.selectorIssues}`);
  console.log(`   🔄 Fallbacks a bridge Python: ${analysis.bridgePythonFallbacks}\n`);

  // Estado general
  console.log('📊 ESTADO GENERAL:');
  const successRate = analysis.totalAttempts > 0 
    ? (analysis.successfulScrapes / analysis.totalAttempts) * 100 
    : 0;

  if (successRate >= 80) {
    console.log('   ✅ SCRAPER FUNCIONANDO BIEN (≥80% éxito)');
  } else if (successRate >= 50) {
    console.log('   ⚠️  SCRAPER CON PROBLEMAS MODERADOS (50-80% éxito)');
  } else {
    console.log('   ❌ SCRAPER CON PROBLEMAS GRAVES (<50% éxito)');
  }
  console.log(`   Tasa de éxito: ${successRate.toFixed(1)}%\n`);

  // Errores recientes
  if (analysis.errors.length > 0) {
    console.log('❌ ÚLTIMOS ERRORES (máx 5):');
    analysis.errors.slice(-5).forEach((error, i) => {
      console.log(`   ${i + 1}. ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`);
    });
    console.log();
  }

  // Advertencias recientes
  if (analysis.warnings.length > 0) {
    console.log('⚠️  ÚLTIMAS ADVERTENCIAS (máx 5):');
    analysis.warnings.slice(-5).forEach((warning, i) => {
      console.log(`   ${i + 1}. ${warning.substring(0, 100)}${warning.length > 100 ? '...' : ''}`);
    });
    console.log();
  }

  // Logs recientes
  if (analysis.recentLogs.length > 0) {
    console.log('📝 LOGS RECIENTES DEL SCRAPER (últimas 10):');
    analysis.recentLogs.slice(-10).forEach((log, i) => {
      console.log(`   ${i + 1}. ${log.substring(0, 120)}${log.length > 120 ? '...' : ''}`);
    });
    console.log();
  }

  // Recomendaciones
  console.log('💡 RECOMENDACIONES:');
  if (analysis.chromiumIssues > analysis.totalAttempts * 0.3) {
    console.log('   🔧 Verificar instalación de Chromium en Railway');
    console.log('   🔧 Revisar nixpacks.toml para asegurar que Chromium se instala');
  }
  if (analysis.captchaIssues > analysis.totalAttempts * 0.3) {
    console.log('   🛡️  Considerar implementar rotación de proxies');
    console.log('   🛡️  Verificar si 2Captcha está configurado correctamente');
  }
  if (analysis.selectorIssues > analysis.totalAttempts * 0.3) {
    console.log('   🎯 AliExpress puede haber cambiado su HTML');
    console.log('   🎯 Actualizar selectores CSS en advanced-scraper.service.ts');
  }
  if (analysis.bridgePythonFallbacks > analysis.totalAttempts * 0.5) {
    console.log('   🔄 El scraping nativo falla frecuentemente');
    console.log('   🔄 Verificar que el bridge Python esté disponible');
  }
  if (successRate >= 80) {
    console.log('   ✅ El scraper está funcionando correctamente');
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// Función principal
async function main() {
  // Intentar leer logs locales primero
  const logsPath = path.join(__dirname, '..', 'logs', 'combined.log');
  
  let logContent = '';

  if (fs.existsSync(logsPath)) {
    console.log('📂 Leyendo logs locales...');
    logContent = fs.readFileSync(logsPath, 'utf-8');
  } else {
    console.log('⚠️  No se encontraron logs locales');
    console.log('💡 Para analizar logs de Railway, ejecuta:');
    console.log('   railway logs | npx ts-node scripts/analyze-scraper-logs.ts');
    console.log('\n📋 O copia los logs manualmente y pégalos aquí (Ctrl+D para terminar):\n');
    
    // Leer de stdin si está disponible
    if (process.stdin.isTTY) {
      console.log('(Esperando entrada de stdin...)');
    }
    
    // Leer de stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    logContent = Buffer.concat(chunks).toString('utf-8');
  }

  if (!logContent || logContent.trim().length === 0) {
    console.error('❌ No se encontraron logs para analizar');
    process.exit(1);
  }

  const analysis = analyzeLogs(logContent);
  printReport(analysis);
}

// Ejecutar
main().catch((error) => {
  console.error('❌ Error analizando logs:', error);
  process.exit(1);
});

