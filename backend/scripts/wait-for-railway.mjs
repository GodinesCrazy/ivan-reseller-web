#!/usr/bin/env node
/**
 * ? CERT-GO: Script para verificar que Railway est� listo
 * 
 * Polls /health y /ready endpoints hasta que respondan correctamente
 * 
 * Uso:
 *   node scripts/wait-for-railway.mjs --url https://xxxxx.up.railway.app
 *   node scripts/wait-for-railway.mjs --url https://xxxxx.up.railway.app --timeout 600000
 */

import axios from 'axios';

const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutos
const POLL_INTERVAL = 5000; // 5 segundos
const HEALTH_TIMEOUT = 5 * 60 * 1000; // 5 minutos para /health

async function parseArgs() {
  const args = process.argv.slice(2);
  let url = null;
  let timeout = DEFAULT_TIMEOUT;
  
  // Primero intentar desde archivo local
  try {
    const fs = await import('fs');
    const path = await import('path');
    const localFile = path.join(process.cwd(), '../../docs/RAILWAY_URL.local');
    if (fs.existsSync(localFile)) {
      const content = fs.readFileSync(localFile, 'utf-8').trim();
      const match = content.match(/RAILWAY_URL=(.+)/);
      if (match) {
        url = match[1].trim();
      }
    }
  } catch (e) {
    // Ignorar si no existe
  }
  
  // Luego desde env
  if (!url) {
    url = process.env.RAILWAY_URL || null;
  }
  
  // Finalmente desde args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && i + 1 < args.length) {
      url = args[i + 1];
    } else if (args[i] === '--timeout' && i + 1 < args.length) {
      timeout = parseInt(args[i + 1], 10);
    } else if (args[i].startsWith('--url=')) {
      url = args[i].substring(7);
    }
  }
  
  return { url, timeout };
}

async function checkHealth(url) {
  try {
    const response = await axios.get(`${url}/health`, {
      timeout: 2000,
      validateStatus: () => true // No lanzar error en 4xx/5xx
    });
    
    if (response.status === 200) {
      return { success: true, status: response.status, data: response.data };
    }
    return { success: false, status: response.status, error: `HTTP ${response.status}` };
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return { success: false, status: null, error: 'Connection refused or timeout' };
    }
    return { success: false, status: null, error: error.message };
  }
}

async function checkReady(url) {
  try {
    const response = await axios.get(`${url}/ready`, {
      timeout: 2000,
      validateStatus: () => true
    });
    
    if (response.status === 200) {
      return { success: true, status: response.status, data: response.data };
    }
    return { success: false, status: response.status, error: `HTTP ${response.status}` };
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return { success: false, status: null, error: 'Connection refused or timeout' };
    }
    return { success: false, status: null, error: error.message };
  }
}

async function waitForHealth(url, timeout) {
  const startTime = Date.now();
  let attempts = 0;
  
  console.log(`?? Esperando /health en ${url}...`);
  console.log(`   Timeout: ${timeout / 1000}s`);
  
  while (Date.now() - startTime < timeout) {
    attempts++;
    const result = await checkHealth(url);
    
    if (result.success) {
      console.log(`? /health OK (intento ${attempts}, ${Math.round((Date.now() - startTime) / 1000)}s)`);
      return true;
    }
    
    if (attempts % 6 === 0) { // Log cada 30s
      console.log(`   Intento ${attempts}: ${result.error || `HTTP ${result.status}`}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
  
  console.error(`? /health timeout despu�s de ${attempts} intentos`);
  return false;
}

async function waitForReady(url, timeout) {
  const startTime = Date.now();
  let attempts = 0;
  
  console.log(`?? Esperando /ready en ${url}...`);
  console.log(`   Timeout: ${timeout / 1000}s`);
  
  while (Date.now() - startTime < timeout) {
    attempts++;
    const result = await checkReady(url);
    
    if (result.success) {
      console.log(`? /ready OK (intento ${attempts}, ${Math.round((Date.now() - startTime) / 1000)}s)`);
      if (result.data) {
        console.log(`   Database: ${result.data.database?.status || 'unknown'}`);
        console.log(`   Redis: ${result.data.redis?.status || 'unknown'}`);
      }
      return true;
    }
    
    if (attempts % 6 === 0) { // Log cada 30s
      const status = result.status === 503 ? '503 (not ready yet)' : result.error || `HTTP ${result.status}`;
      console.log(`   Intento ${attempts}: ${status}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
  
  console.error(`? /ready timeout despu�s de ${attempts} intentos`);
  return false;
}

async function main() {
  const { url, timeout } = await parseArgs();
  
  if (!url) {
    console.error('? Uso: node scripts/wait-for-railway.mjs --url <RAILWAY_URL> [--timeout <ms>]');
    console.error('   Ejemplo: node scripts/wait-for-railway.mjs --url https://xxxxx.up.railway.app');
    process.exit(1);
  }
  
  if (!url.startsWith('http')) {
    console.error('? URL debe empezar con http:// o https://');
    process.exit(1);
  }
  
  console.log(`\n?? Verificando Railway deployment: ${url}\n`);
  
  // 1. Verificar /health
  const healthOk = await waitForHealth(url, HEALTH_TIMEOUT);
  if (!healthOk) {
    console.error('\n? /health no responde. Verifica logs en Railway Dashboard.');
    process.exit(1);
  }
  
  // 2. Verificar /ready
  const readyOk = await waitForReady(url, timeout);
  if (!readyOk) {
    console.error('\n? /ready no responde. Verifica:');
    console.error('   - Migraciones aplicadas correctamente');
    console.error('   - DATABASE_URL configurada');
    console.error('   - Logs en Railway Dashboard');
    process.exit(1);
  }
  
  console.log('\n? Railway deployment verificado y listo!');
  process.exit(0);
}

main().catch(error => {
  console.error('\n? Error:', error.message);
  process.exit(1);
});
