/**
 * Script para diagnosticar problemas de conectividad con AliExpress API
 * 
 * Uso:
 *   cd backend && npx tsx scripts/diagnose-connectivity.ts
 */

import 'dotenv/config';
import https from 'https';
import http from 'http';
import { lookup } from 'dns/promises';
import { execSync } from 'child_process';
import os from 'os';

const ALIEXPRESS_API_HOST = 'gw.api.taobao.com';
const ALIEXPRESS_API_IP = '47.246.177.246';
const ALIEXPRESS_API_PORT = 443;

interface DiagnosticResult {
  test: string;
  status: 'success' | 'failed' | 'warning';
  message: string;
  details?: any;
}

const results: DiagnosticResult[] = [];

function addResult(test: string, status: 'success' | 'failed' | 'warning', message: string, details?: any) {
  results.push({ test, status, message, details });
  const emoji = status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌';
  console.log(`${emoji} ${test}: ${message}`);
  if (details) {
    console.log(`   Detalles: ${JSON.stringify(details, null, 2).split('\n').slice(0, 3).join('\n')}...`);
  }
}

/**
 * Test 1: Resolución DNS
 */
async function testDNS() {
  try {
    console.log('\n📡 Test 1: Resolución DNS...');
    const addresses = await lookup(ALIEXPRESS_API_HOST);
    addResult(
      'DNS Resolution',
      'success',
      `Host resuelto correctamente a ${addresses.address}`,
      { host: ALIEXPRESS_API_HOST, ip: addresses.address, family: addresses.family }
    );
    return addresses.address;
  } catch (error: any) {
    addResult(
      'DNS Resolution',
      'failed',
      `No se pudo resolver el host: ${error.message}`,
      { host: ALIEXPRESS_API_HOST, error: error.message }
    );
    return null;
  }
}

/**
 * Test 2: Ping (Windows/Linux)
 */
async function testPing(ip: string) {
  try {
    console.log('\n📡 Test 2: Ping a servidor...');
    const isWindows = os.platform() === 'win32';
    const pingCommand = isWindows 
      ? `ping -n 4 ${ip}`
      : `ping -c 4 ${ip}`;
    
    const output = execSync(pingCommand, { encoding: 'utf-8', timeout: 10000 });
    const lines = output.split('\n');
    const statsLine = lines.find(line => 
      isWindows ? line.includes('Tiempo promedio') || line.includes('Average') : line.includes('packet loss')
    );
    
    addResult(
      'Ping',
      'success',
      'Ping exitoso',
      { output: statsLine || 'Ver salida completa', ip }
    );
  } catch (error: any) {
    addResult(
      'Ping',
      'failed',
      `Ping falló: ${error.message}`,
      { ip, error: error.message }
    );
  }
}

/**
 * Test 3: Conexión TCP directa
 */
function testTCPConnection(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('\n📡 Test 3: Conexión TCP directa...');
    const socket = new https.Agent();
    
    const req = https.request({
      hostname: host,
      port: port,
      method: 'HEAD',
      timeout: 10000,
      agent: new https.Agent({
        keepAlive: false,
        rejectUnauthorized: false // Permitir certificados autofirmados para testing
      })
    }, (res) => {
      addResult(
        'TCP Connection',
        'success',
        `Conexión establecida (Status: ${res.statusCode})`,
        { host, port, statusCode: res.statusCode, headers: Object.keys(res.headers) }
      );
      resolve();
    });

    req.on('error', (error: any) => {
      const isTimeout = error.code === 'ETIMEDOUT' || error.message.includes('timeout');
      const isConnRefused = error.code === 'ECONNREFUSED';
      const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'ECONNRESET';
      
      addResult(
        'TCP Connection',
        'failed',
        `No se pudo conectar: ${error.code || error.message}`,
        { 
          host, 
          port, 
          error: error.message,
          code: error.code,
          isTimeout,
          isConnRefused,
          isNetworkError,
          suggestion: isTimeout 
            ? 'El firewall o proxy puede estar bloqueando la conexión'
            : isConnRefused
            ? 'El puerto puede estar bloqueado'
            : 'Verificar configuración de red'
        }
      );
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      addResult(
        'TCP Connection',
        'failed',
        'Timeout: La conexión tardó más de 10 segundos',
        { host, port, suggestion: 'Firewall, proxy o restricciones de red' }
      );
      reject(new Error('Connection timeout'));
    });

    req.end();
  });
}

/**
 * Test 4: Verificar configuración de proxy
 */
function testProxyConfig() {
  console.log('\n📡 Test 4: Configuración de Proxy...');
  
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTP_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  
  if (httpProxy || httpsProxy) {
    addResult(
      'Proxy Configuration',
      'warning',
      'Proxy detectado en variables de entorno',
      { 
        httpProxy: httpProxy ? 'Configurado' : 'No configurado',
        httpsProxy: httpsProxy ? 'Configurado' : 'No configurado',
        noProxy: noProxy || 'No configurado',
        suggestion: 'Verificar que el proxy permita conexiones a *.taobao.com'
      }
    );
  } else {
    addResult(
      'Proxy Configuration',
      'success',
      'No se detectó proxy configurado',
      { note: 'Si estás detrás de un proxy corporativo, puede ser necesario configurarlo' }
    );
  }
}

/**
 * Test 5: Verificar firewall de Windows
 */
function testWindowsFirewall() {
  console.log('\n📡 Test 5: Firewall de Windows...');
  
  if (os.platform() !== 'win32') {
    addResult(
      'Windows Firewall',
      'warning',
      'Sistema operativo no es Windows',
      { platform: os.platform() }
    );
    return;
  }

  try {
    // Verificar estado del firewall
    const firewallStatus = execSync('netsh advfirewall show allprofiles state', { 
      encoding: 'utf-8',
      timeout: 5000 
    });
    
    const isEnabled = firewallStatus.includes('ON') || firewallStatus.includes('Activado');
    
    if (isEnabled) {
      addResult(
        'Windows Firewall',
        'warning',
        'Firewall de Windows está ACTIVADO',
        { 
          suggestion: 'Puede estar bloqueando conexiones salientes. Verificar reglas de firewall.',
          instructions: [
            '1. Abrir "Firewall de Windows Defender"',
            '2. Ir a "Configuración avanzada"',
            '3. Verificar reglas de salida para Node.js/Chrome',
            '4. O temporalmente deshabilitar para probar (NO recomendado en producción)'
          ]
        }
      );
    } else {
      addResult(
        'Windows Firewall',
        'success',
        'Firewall de Windows está DESACTIVADO',
        {}
      );
    }
  } catch (error: any) {
    addResult(
      'Windows Firewall',
      'warning',
      'No se pudo verificar el estado del firewall',
      { error: error.message, suggestion: 'Verificar manualmente en Configuración de Windows' }
    );
  }
}

/**
 * Test 6: Test con axios directamente
 */
async function testAxiosConnection() {
  console.log('\n📡 Test 6: Test con Axios (simulando llamada real)...');
  
  try {
    const axios = (await import('axios')).default;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await axios.post(
      `https://${ALIEXPRESS_API_HOST}/router/rest`,
      'method=test&format=json',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
        signal: controller.signal,
        validateStatus: () => true, // Aceptar cualquier código de estado
      }
    );
    
    clearTimeout(timeoutId);
    
    addResult(
      'Axios Connection',
      'success',
      `Conexión exitosa (Status: ${response.status})`,
      { 
        host: ALIEXPRESS_API_HOST,
        status: response.status,
        statusText: response.statusText,
        elapsed: `${Date.now()}ms`
      }
    );
  } catch (error: any) {
    const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.message.includes('timeout');
    const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET';
    
    addResult(
      'Axios Connection',
      'failed',
      `Error de conexión: ${error.code || error.message}`,
      {
        error: error.message,
        code: error.code,
        isTimeout,
        isNetworkError,
        suggestions: [
          isTimeout ? 'Firewall o proxy bloqueando conexiones HTTPS' : null,
          isNetworkError ? 'Verificar configuración de DNS o proxy' : null,
          'Probar desde otra red (móvil, otra WiFi)',
          'Verificar que no haya antivirus bloqueando conexiones'
        ].filter(Boolean)
      }
    );
  }
}

/**
 * Generar reporte y recomendaciones
 */
function generateReport() {
  console.log('\n\n📊 RESUMEN DE DIAGNÓSTICO\n');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  
  console.log(`✅ Exitosos: ${successful}`);
  console.log(`❌ Fallidos: ${failed}`);
  console.log(`⚠️  Advertencias: ${warnings}`);
  console.log('='.repeat(60));
  
  if (failed > 0) {
    console.log('\n🔧 RECOMENDACIONES PARA SOLUCIONAR PROBLEMAS DE CONECTIVIDAD:\n');
    
    console.log('1. VERIFICAR FIREWALL DE WINDOWS:');
    console.log('   - Abrir "Firewall de Windows Defender con seguridad avanzada"');
    console.log('   - Ir a "Reglas de salida"');
    console.log('   - Verificar que Node.js tenga permitidas conexiones salientes');
    console.log('   - Crear nueva regla si es necesario: Permitir > Programa > Node.js > Cualquier puerto');
    
    console.log('\n2. VERIFICAR ANTIVIRUS:');
    console.log('   - Verificar si el antivirus tiene firewall integrado');
    console.log('   - Temporalmente deshabilitar para probar (NO en producción)');
    console.log('   - Agregar excepción para Node.js');
    
    console.log('\n3. VERIFICAR PROXY CORPORATIVO/UNIVERSITARIO:');
    console.log('   - Si estás en red corporativa/universitaria, puede haber proxy');
    console.log('   - Configurar proxy en variables de entorno:');
    console.log('     export HTTP_PROXY=http://proxy:puerto');
    console.log('     export HTTPS_PROXY=http://proxy:puerto');
    
    console.log('\n4. PROBAR DESDE OTRA RED:');
    console.log('   - Usar hotspot de móvil');
    console.log('   - Probar desde otra WiFi');
    console.log('   - Si funciona en otra red, el problema es de tu red local');
    
    console.log('\n5. VERIFICAR DNS:');
    console.log('   - Probar cambiar DNS a 8.8.8.8 (Google) o 1.1.1.1 (Cloudflare)');
    console.log('   - En Windows: Configuración > Red > Cambiar opciones del adaptador');
    
    console.log('\n6. DESARROLLO LOCAL vs PRODUCCIÓN:');
    console.log('   - Este problema solo afecta desarrollo LOCAL');
    console.log('   - En Railway (producción) NO debería haber este problema');
    console.log('   - Considerar usar Railway para desarrollo también');
    
    console.log('\n7. SOLUCIÓN TEMPORAL PARA DESARROLLO:');
    console.log('   - Usar VPN para saltar restricciones de red');
    console.log('   - Usar proxy público (NO recomendado para producción)');
    console.log('   - Desarrollar directamente en Railway usando Railway CLI');
  } else {
    console.log('\n✅ No se detectaron problemas de conectividad críticos.');
    console.log('   Si aún tienes problemas, puede ser temporal o específico del endpoint.');
  }
  
  console.log('\n' + '='.repeat(60));
}

// Ejecutar todos los tests
async function runDiagnostics() {
  console.log('🔍 DIAGNÓSTICO DE CONECTIVIDAD - AliExpress API');
  console.log('='.repeat(60));
  console.log(`Target: ${ALIEXPRESS_API_HOST} (${ALIEXPRESS_API_IP}:${ALIEXPRESS_API_PORT})`);
  console.log('='.repeat(60));
  
  try {
    // Test 1: DNS
    const resolvedIp = await testDNS();
    
    // Test 2: Ping
    if (resolvedIp) {
      await testPing(resolvedIp);
    } else {
      await testPing(ALIEXPRESS_API_IP);
    }
    
    // Test 3: TCP Connection
    try {
      await testTCPConnection(ALIEXPRESS_API_HOST, ALIEXPRESS_API_PORT);
    } catch (e) {
      // Ya se registró el error
    }
    
    // Test 4: Proxy
    testProxyConfig();
    
    // Test 5: Windows Firewall
    testWindowsFirewall();
    
    // Test 6: Axios (test real)
    await testAxiosConnection();
    
    // Generar reporte
    generateReport();
    
  } catch (error: any) {
    console.error('\n❌ Error durante diagnóstico:', error.message);
  }
}

runDiagnostics()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });

