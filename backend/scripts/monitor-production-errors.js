/**
 * Script de Monitoreo de Errores en Producción
 * 
 * Detecta:
 * - SIGSEGV
 * - Errores de serialización JSON
 * - Errores silenciosos
 * - Problemas con sugerencias IA
 * - Errores de capital/validación
 */

const fs = require('fs');
const path = require('path');

// Configuración
const LOG_DIR = process.env.LOG_DIR || './logs';
const CHECK_INTERVAL = 60000; // 1 minuto
const ALERT_THRESHOLD = 3; // Alertar después de 3 ocurrencias

const errorPatterns = {
  sigsegv: /SIGSEGV|signal SIGSEGV|npm error signal/i,
  jsonSerialization: /Error serializando|JSON\.stringify|serialization/i,
  suggestionsError: /AISuggestions.*error|Error.*sugerencias/i,
  capitalError: /capital.*insuficiente|working.*capital.*error/i,
  databaseError: /prisma.*error|database.*error|connection.*error/i,
  paymentError: /paypal.*error|payment.*failed|purchase.*failed/i
};

const errorCounts = {};
const lastAlerts = {};

function scanLogFiles() {
  const issues = [];
  
  try {
    // Buscar archivos de log recientes
    const logFiles = fs.readdirSync(LOG_DIR)
      .filter(file => file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: path.join(LOG_DIR, file),
        mtime: fs.statSync(path.join(LOG_DIR, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5); // Solo los 5 más recientes

    for (const logFile of logFiles) {
      // Leer últimas 100 líneas del archivo
      const content = fs.readFileSync(logFile.path, 'utf8');
      const lines = content.split('\n').slice(-100);

      for (const [patternName, pattern] of Object.entries(errorPatterns)) {
        const matches = lines.filter(line => pattern.test(line));
        
        if (matches.length > 0) {
          const key = `${logFile.name}:${patternName}`;
          errorCounts[key] = (errorCounts[key] || 0) + matches.length;

          if (errorCounts[key] >= ALERT_THRESHOLD) {
            const lastAlert = lastAlerts[key] || 0;
            const now = Date.now();
            
            // Solo alertar si no se ha alertado en los últimos 5 minutos
            if (now - lastAlert > 5 * 60 * 1000) {
              issues.push({
                type: patternName,
                file: logFile.name,
                count: errorCounts[key],
                recentLines: matches.slice(-3) // Últimas 3 ocurrencias
              });
              lastAlerts[key] = now;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error escaneando logs:', error.message);
  }

  return issues;
}

function generateReport(issues) {
  if (issues.length === 0) {
    console.log('✅ No se detectaron problemas críticos');
    return;
  }

  console.log('\n🚨 ALERTAS DE PRODUCCIÓN DETECTADAS:\n');
  
  for (const issue of issues) {
    console.log(`❌ ${issue.type.toUpperCase()} en ${issue.file}`);
    console.log(`   Ocurrencias: ${issue.count}`);
    console.log(`   Ejemplos recientes:`);
    issue.recentLines.forEach((line, i) => {
      console.log(`   ${i + 1}. ${line.substring(0, 100)}...`);
    });
    console.log('');
  }
}

function checkSuggestionsAPI() {
  // Verificar que el endpoint de sugerencias funciona
  const http = require('http');
  const testUrl = process.env.API_URL || 'http://localhost:3000';
  
  return new Promise((resolve) => {
    const req = http.get(`${testUrl}/api/ai-suggestions`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success && Array.isArray(parsed.suggestions)) {
            console.log(`✅ API de Sugerencias IA respondiendo correctamente (${parsed.suggestions.length} sugerencias)`);
            resolve(true);
          } else {
            console.log(`⚠️  API de Sugerencias IA respondió pero formato inesperado`);
            resolve(false);
          }
        } catch (error) {
          console.log(`❌ Error parseando respuesta de API: ${error.message}`);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Error conectando a API: ${error.message}`);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      console.log(`⏱️  Timeout conectando a API`);
      resolve(false);
    });
  });
}

async function main() {
  console.log('🔍 Monitoreo de Producción - Iniciado\n');
  console.log(`📁 Directorio de logs: ${LOG_DIR}`);
  console.log(`⏱️  Intervalo de chequeo: ${CHECK_INTERVAL / 1000} segundos\n`);

  // Chequeo inicial
  const issues = scanLogFiles();
  generateReport(issues);
  
  // Verificar API de sugerencias
  await checkSuggestionsAPI();

  // Monitoreo continuo (si se ejecuta como servicio)
  if (process.env.CONTINUOUS_MONITORING === 'true') {
    console.log('\n🔄 Iniciando monitoreo continuo...\n');
    
    setInterval(async () => {
      const newIssues = scanLogFiles();
      if (newIssues.length > 0) {
        generateReport(newIssues);
        // Aquí podrías agregar notificaciones (email, Slack, etc.)
      }
      
      await checkSuggestionsAPI();
    }, CHECK_INTERVAL);
  } else {
    console.log('\n💡 Para monitoreo continuo, ejecuta con: CONTINUOUS_MONITORING=true node monitor-production-errors.js');
  }
}

main().catch(console.error);

