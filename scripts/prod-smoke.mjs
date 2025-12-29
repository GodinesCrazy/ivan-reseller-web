#!/usr/bin/env node
/**
 * Production Smoke Test - AliExpress Dropshipping OAuth Validation (HARDENED GATE)
 * 
 * Valida que los endpoints críticos funcionen en producción con criterios estrictos:
 * - Health checks deben ser 200
 * - Callback NO puede ser 502, 404, ni devolver SPA React
 * - API endpoints deben ser 200/401/403 (NO 404, NO 502)
 * 
 * Genera:
 * - docs/_smoke/last-smoke.json (machine-readable results)
 * - docs/ALIEXPRESS_DROPSHIPPING_OAUTH_PROD_VALIDATION_REPORT.FILLED.md (auto-filled report)
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PRODUCTION_DOMAIN = 'ivanreseller.com';
const RAILWAY_URL = 'ivan-reseller-web-production.up.railway.app';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'IvanReseller-ProdSmokeTest/1.0',
        ...options.headers,
      },
      timeout: options.timeout || 10000,
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          url: url,
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

/**
 * Realiza una request siguiendo redirects automáticamente
 * 
 * @param {string} url - URL inicial
 * @param {Object} options - Opciones de request
 * @param {number} maxRedirects - Máximo de redirects a seguir (default: 5)
 * @returns {Promise<Object>} - Response final con redirectChain y finalUrl
 */
async function requestWithRedirects(url, options = {}, maxRedirects = 5) {
  const redirectChain = [];
  let currentUrl = url;
  let totalDuration = 0;
  
  for (let i = 0; i <= maxRedirects; i++) {
    if (i > 0) {
      // Small delay between redirects
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const startTime = Date.now();
    try {
      const response = await makeRequest(currentUrl, options);
      const duration = Date.now() - startTime;
      totalDuration += duration;
      
      const status = response.status;
      const location = response.headers['location'] || response.headers['Location'];
      
      // Check if it's a redirect
      if ((status === 301 || status === 302 || status === 303 || status === 307 || status === 308) && location) {
        // Resolve relative URLs against current URL
        let nextUrl;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch (e) {
          // If URL resolution fails, use location as-is (shouldn't happen)
          nextUrl = location;
        }
        
        redirectChain.push({
          from: currentUrl,
          to: nextUrl,
          status: status,
        });
        
        currentUrl = nextUrl;
        
        // Continue following redirects
        continue;
      }
      
      // Not a redirect, return final response
      return {
        finalUrl: currentUrl,
        status: status,
        headers: response.headers,
        body: response.body,
        durationMs: totalDuration,
        redirectChain: redirectChain,
      };
    } catch (error) {
      // If request fails, return error with current redirect chain
      return {
        finalUrl: currentUrl,
        status: null,
        error: error.message,
        durationMs: totalDuration,
        redirectChain: redirectChain,
      };
    }
  }
  
  // Max redirects exceeded
  return {
    finalUrl: currentUrl,
    status: null,
    error: `Max redirects (${maxRedirects}) exceeded`,
    durationMs: totalDuration,
    redirectChain: redirectChain,
  };
}

function truncate(str, maxLength = 200) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function formatHeaders(headers) {
  // Filtrar headers sensibles y formatear
  const filtered = {};
  const sensitive = ['cookie', 'set-cookie', 'authorization', 'x-api-key'];
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (!sensitive.includes(lowerKey)) {
      filtered[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  
  return filtered;
}

/**
 * Detecta si la respuesta es el SPA React (index.html)
 * 
 * @param {Object} response - Response object con headers y body
 * @returns {boolean} - true si parece ser el SPA React
 */
function isSPAResponse(response) {
  const contentType = (response.headers['content-type'] || '').toLowerCase();
  const body = response.body || '';
  const bodyLower = body.toLowerCase();
  
  // Check content-type includes text/html
  if (!contentType.includes('text/html')) {
    return false;
  }
  
  // Check for typical SPA patterns
  // ✅ HARDENED: Detectar SPA por <!doctype html> (requisito específico)
  const spaPatterns = [
    /<!doctype\s+html>/i, // Requisito específico: detectar por doctype
    /<div[^>]*id=["']root["']/i,
    /id=["']root["']/i,
    /<script[^>]*type=["']module["']/i,
    /vite/i,
    /react/i,
    /<div[^>]*id="app"/i,
  ];
  
  for (const pattern of spaPatterns) {
    if (pattern.test(body)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Valida endpoint según criterios endurecidos (usa resultado FINAL después de redirects)
 */
function validateEndpoint(name, url, finalResponse, testConfig) {
  const finalStatus = finalResponse.status;
  const finalBody = finalResponse.body || '';
  
  const result = {
    name,
    url,
    finalUrl: finalResponse.finalUrl || url,
    status: finalStatus,
    finalStatus: finalStatus,
    duration: finalResponse.durationMs || 0,
    pass: false,
    failReason: null,
    is502: finalStatus === 502,
    is404: finalStatus === 404,
    isSPA: false,
    redirectChain: finalResponse.redirectChain || [],
    headers: formatHeaders(finalResponse.headers || {}),
    bodyPreview: truncate(finalBody, 200),
  };
  
  // Health Check: debe ser 200 (FINAL status después de redirects)
  if (name === 'Health Check') {
    if (finalStatus === 200) {
      result.pass = true;
    } else {
      result.pass = false;
      result.failReason = `Health check must return 200 (final), got ${finalStatus}`;
    }
    return result;
  }
  
  // Callback: NO 502, NO 404, NO SPA (FINAL después de redirects)
  if (name.includes('AliExpress Callback')) {
    if (finalStatus === 502) {
      result.pass = false;
      result.failReason = 'Callback returns 502 (final) - NOT reaching backend';
      return result;
    }
    
    if (finalStatus === 404) {
      result.pass = false;
      result.failReason = 'Callback returns 404 (final) - route not found or rewrite not working';
      return result;
    }
    
    // Check for SPA in final response body
    result.isSPA = isSPAResponse({ headers: finalResponse.headers || {}, body: finalBody });
    if (result.isSPA) {
      result.pass = false;
      result.failReason = 'Callback returns SPA React (index.html) in final response - rewrite not working, callback not reaching backend';
      return result;
    }
    
    // 3xx or 4xx (but NOT 404) and NOT SPA → OK (reached backend)
    if ((finalStatus >= 300 && finalStatus < 500) || finalStatus >= 200) {
      result.pass = true;
      return result;
    }
    
    result.pass = false;
    result.failReason = `Unexpected final status ${finalStatus}`;
    return result;
  }
  
  // API endpoints: 200/401/403 OK, 404/502 FAIL (FINAL después de redirects)
  if (name.includes('Auth Status') || name.includes('Dashboard Stats') || name.includes('Products')) {
    if (finalStatus === 404) {
      result.pass = false;
      result.failReason = `Returns 404 (final) - route broken or rewrite issue`;
      return result;
    }
    
    if (finalStatus === 502) {
      result.pass = false;
      result.failReason = 'Returns 502 (final) - backend not reachable';
      return result;
    }
    
    if (finalStatus === 200 || finalStatus === 401 || finalStatus === 403) {
      result.pass = true;
      return result;
    }
    
    result.pass = false;
    result.failReason = `Unexpected final status ${finalStatus}, expected 200/401/403`;
    return result;
  }
  
  // Default: accept if not error (FINAL)
  if (finalStatus && finalStatus < 500 && finalStatus !== 404) {
    result.pass = true;
  } else {
    result.pass = false;
    result.failReason = `Final status ${finalStatus} not acceptable`;
  }
  
  return result;
}

async function testEndpoint(name, url, testConfig = {}) {
  log(`\n${'='.repeat(80)}`, 'cyan');
  log(`Testing: ${name}`, 'blue');
  log(`URL: ${url}`, 'cyan');
  log(`${'='.repeat(80)}`, 'cyan');
  
  try {
    const finalResponse = await requestWithRedirects(url);
    
    if (finalResponse.error) {
      log(`❌ ERROR: ${finalResponse.error}`, 'red');
      return {
        name,
        url,
        finalUrl: finalResponse.finalUrl || url,
        status: null,
        finalStatus: null,
        duration: finalResponse.durationMs || 0,
        pass: false,
        failReason: `Request failed: ${finalResponse.error}`,
        is502: false,
        is404: false,
        isSPA: false,
        redirectChain: finalResponse.redirectChain || [],
        error: finalResponse.error,
        headers: {},
        bodyPreview: '',
      };
    }
    
    const validation = validateEndpoint(name, url, finalResponse, testConfig);
    
    const statusColor = validation.pass ? 'green' :
                       validation.is502 ? 'red' :
                       validation.is404 ? 'red' :
                       (validation.finalStatus >= 400 && validation.finalStatus < 500) ? 'yellow' :
                       validation.finalStatus >= 500 ? 'red' : 'reset';
    
    // Show redirect chain if exists
    if (validation.redirectChain && validation.redirectChain.length > 0) {
      log(`\n↪️  Redirects (${validation.redirectChain.length}):`, 'cyan');
      validation.redirectChain.forEach((redirect, idx) => {
        log(`   ${idx + 1}. ${redirect.from} → ${redirect.to} (${redirect.status})`, 'cyan');
      });
      log(`   Final URL: ${validation.finalUrl}`, 'cyan');
    }
    
    log(`\nStatus (final): ${validation.finalStatus}`, statusColor);
    log(`Duration: ${validation.duration}ms`, 'cyan');
    
    if (validation.isSPA) {
      log(`⚠️  DETECTED: Final response is SPA React (index.html)`, 'red');
    }
    
    if (validation.pass) {
      log(`✅ PASS`, 'green');
    } else {
      log(`❌ FAIL: ${validation.failReason}`, 'red');
    }
    
    log(`\nHeaders (filtered):`, 'cyan');
    console.log(JSON.stringify(validation.headers, null, 2));
    
    log(`\nBody (first 200 chars):`, 'cyan');
    log(validation.bodyPreview);
    
    return validation;
  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return {
      name,
      url,
      finalUrl: url,
      status: null,
      finalStatus: null,
      duration: 0,
      pass: false,
      failReason: `Request failed: ${error.message}`,
      is502: false,
      is404: false,
      isSPA: false,
      redirectChain: [],
      error: error.message,
      headers: {},
      bodyPreview: '',
    };
  }
}

/**
 * Genera el reporte JSON machine-readable
 */
function generateJSONReport(results, timestamp) {
  const productionResults = results.filter(r => r.source === 'production');
  const railwayResults = results.filter(r => r.source === 'railway-direct');
  
  const passed = results.filter(r => r.pass);
  const failed = results.filter(r => !r.pass);
  
  const callbackTest = productionResults.find(r => r.name.includes('AliExpress Callback'));
  const healthTest = productionResults.find(r => r.name === 'Health Check');
  
  // Determine callback conclusion
  let callbackReachesBackend = null;
  let callbackExplanation = '';
  
  if (callbackTest) {
    const finalStatus = callbackTest.finalStatus || callbackTest.status;
    if (finalStatus === 502 || finalStatus === 404 || callbackTest.isSPA) {
      callbackReachesBackend = false;
      callbackExplanation = callbackTest.failReason || `Callback failed with final status ${finalStatus}`;
    } else if (finalStatus >= 200 && finalStatus < 500) {
      callbackReachesBackend = true;
      const redirectNote = callbackTest.redirectChain && callbackTest.redirectChain.length > 0 
        ? ` (after ${callbackTest.redirectChain.length} redirect${callbackTest.redirectChain.length > 1 ? 's' : ''})`
        : '';
      callbackExplanation = `Callback reaches backend (final status ${finalStatus}${redirectNote})`;
    } else {
      callbackReachesBackend = null;
      callbackExplanation = 'Inconclusive - needs investigation';
    }
  }
  
  // Determine API endpoints status
  const apiEndpoints = productionResults.filter(r => 
    r.name.includes('Auth Status') || 
    r.name.includes('Dashboard Stats') || 
    r.name.includes('Products')
  );
  
  const apiEndpoints502 = apiEndpoints.filter(r => r.is502);
  const apiEndpointsOK = apiEndpoints.filter(r => r.pass);
  
  let apiEndpointsStatus = null;
  let apiEndpointsExplanation = '';
  
  if (apiEndpoints502.length > 0) {
    apiEndpointsStatus = false;
    apiEndpointsExplanation = `Endpoints with 502: ${apiEndpoints502.map(r => r.name).join(', ')}`;
  } else if (apiEndpointsOK.length === apiEndpoints.length) {
    apiEndpointsStatus = true;
    apiEndpointsExplanation = 'All API endpoints respond correctly (200/401/403)';
  } else {
    apiEndpointsStatus = null;
    apiEndpointsExplanation = 'Partial - some endpoints have issues';
  }
  
  // Overall status
  const overallPass = failed.length === 0;
  const overallStatus = overallPass ? 'PASS' : (passed.length > 0 ? 'PARTIAL' : 'FAIL');
  
  return {
    timestamp,
    overallStatus,
    overallPass,
    summary: {
      total: results.length,
      passed: passed.length,
      failed: failed.length,
    },
    results: results.map(r => ({
      name: r.name,
      url: r.url,
      finalUrl: r.finalUrl || r.url,
      source: r.source || 'production',
      status: r.status,
      finalStatus: r.finalStatus || r.status,
      duration: r.duration,
      pass: r.pass,
      failReason: r.failReason || null,
      is502: r.is502 || false,
      is404: r.is404 || false,
      isSPA: r.isSPA || false,
      redirectChain: r.redirectChain || [],
    })),
    analysis: {
      callbackReachesBackend,
      callbackExplanation,
      apiEndpointsStatus,
      apiEndpointsExplanation,
      healthCheckPass: healthTest ? healthTest.pass : false,
    },
    comparison: railwayResults.length > 0 ? {
      railwayHealthCheck: railwayResults.find(r => r.name.includes('Health Check')),
      railwayCallback: railwayResults.find(r => r.name.includes('Callback')),
    } : null,
    recommendation: overallPass ? 'GO' : (overallStatus === 'PARTIAL' ? 'HOLD' : 'NO-GO'),
  };
}

/**
 * Genera el reporte markdown llenado automáticamente
 */
function generateFilledReport(jsonReport, templatePath) {
  const template = fs.readFileSync(templatePath, 'utf-8');
  
  const timestamp = new Date(jsonReport.timestamp).toLocaleString('es-ES', { 
    timeZone: 'UTC',
    dateStyle: 'full',
    timeStyle: 'long'
  });
  
  let filled = template;
  
  // Replace metadata
  filled = filled.replace(/\[FECHA_DE_EJECUCION\]/g, timestamp);
  filled = filled.replace(/\[EJECUTOR\]/g, 'Automated Smoke Test');
  
  // Replace results table - production endpoints
  const productionResults = jsonReport.results.filter(r => r.source === 'production');
  let resultsTable = '';
  
  const endpointOrder = [
    { name: 'Health Check', display: 'Health Check' },
    { name: 'Auth Status', display: 'Auth Status' },
    { name: 'Dashboard Stats', display: 'Dashboard Stats' },
    { name: 'Products', display: 'Products' },
    { name: 'AliExpress Callback (via Vercel rewrite)', display: 'AliExpress Callback' },
    { name: 'AliExpress OAuth Debug', display: 'OAuth Debug' },
  ];
  
  for (const endpoint of endpointOrder) {
    const result = productionResults.find(r => r.name === endpoint.name);
    if (result) {
      const status = result.finalStatus !== null && result.finalStatus !== undefined ? result.finalStatus.toString() : (result.status?.toString() || 'ERROR');
      let notes = result.pass ? '✅ OK' : `❌ ${result.failReason || 'Failed'}`;
      if (result.redirectChain && result.redirectChain.length > 0) {
        notes += ` (${result.redirectChain.length} redirect${result.redirectChain.length > 1 ? 's' : ''})`;
      }
      resultsTable += `| ${endpoint.display} | \`${result.finalUrl || result.url}\` | ${status} | ${notes} |\n`;
    }
  }
  
  // Replace the table section
  const tablePattern = /\| Health Check \| `[^`]+` \| \[STATUS\] \| \[NOTAS\] \|[\s\S]*?\| OAuth Debug \| `[^`]+` \| \[STATUS\] \| \[NOTAS\] \|/;
  filled = filled.replace(tablePattern, resultsTable.trim());
  
  // Replace overall result
  const resultText = jsonReport.overallStatus === 'PASS' ? '✅ PASS' : 
                     jsonReport.overallStatus === 'PARTIAL' ? '⚠️ PARTIAL' : '❌ FAIL';
  filled = filled.replace(
    /\*\*Resultado:\*\* \[✅ PASS \/ ❌ FAIL \/ ⚠️ PARTIAL\]/,
    `**Resultado:** ${resultText}`
  );
  
  // Replace railway results if any
  if (jsonReport.comparison) {
    const railwayHealth = jsonReport.comparison.railwayHealthCheck;
    const railwayCallback = jsonReport.comparison.railwayCallback;
    
    const railwayHealthStatus = railwayHealth?.finalStatus?.toString() || railwayHealth?.status?.toString() || 'N/A';
  const railwayCallbackStatus = railwayCallback?.finalStatus?.toString() || railwayCallback?.status?.toString() || 'N/A';
  const railwayTable = `| Railway Health Check | \`https://${RAILWAY_URL}/api/health\` | ${railwayHealthStatus} | ${railwayHealth?.pass ? '✅ OK' : '❌ ' + (railwayHealth?.failReason || 'FAIL')} |
| Railway AliExpress Callback | \`https://${RAILWAY_URL}/aliexpress/callback?code=test&state=test\` | ${railwayCallbackStatus} | ${railwayCallback?.pass ? '✅ OK' : '❌ ' + (railwayCallback?.failReason || 'FAIL')} |`;
    
    const railwayPattern = /\| Railway Health Check \| `[^`]+` \| \[STATUS\] \| \[NOTAS\] \|[\s\S]*?\| Railway AliExpress Callback \| `[^`]+` \| \[STATUS\] \| \[NOTAS\] \|/;
    filled = filled.replace(railwayPattern, railwayTable);
    
    // Replace railway result status
    const railwayResultText = (railwayHealth?.pass && railwayCallback?.pass) ? '✅ PASS' : '❌ FAIL';
    filled = filled.replace(
      /\*\*Resultado:\*\* \[✅ PASS \/ ❌ FAIL \/ ⚠️ PARTIAL\]/g,
      `**Resultado:** ${railwayResultText}`
    );
  }
  
  // Replace callback analysis
  const callbackResult = productionResults.find(r => r.name.includes('Callback'));
  const callbackStatus = jsonReport.analysis.callbackReachesBackend === true ? 
    '- [x] ✅ **SÍ** - El callback llega al backend (status 200-499, NO 502)' :
    jsonReport.analysis.callbackReachesBackend === false ?
    '- [x] ❌ **NO** - El callback NO llega al backend (502 o error de conexión)' :
    '- [x] ⚠️ **INCONCLUSO** - Necesita más investigación';
  
  filled = filled.replace(
    /- \[ \] ✅ \*\*SÍ\*\* - El callback llega al backend \(status 200-499, NO 502\)[\s\S]*?- \[ \] ⚠️ \*\*INCONCLUSO\*\* - Necesita más investigación/,
    callbackStatus
  );
  
  // Replace callback evidence (multiple replacements for same placeholder)
  const callbackStatusCode = callbackResult?.finalStatus?.toString() || callbackResult?.status?.toString() || 'N/A';
  const callbackBodyPreview = (callbackResult?.bodyPreview || '').substring(0, 100).replace(/\n/g, ' ') || 'N/A';
  const callbackRedirectNote = callbackResult?.redirectChain && callbackResult.redirectChain.length > 0
    ? `\n- Redirect chain: ${callbackResult.redirectChain.map(r => `${r.from} → ${r.to}`).join(', ')}`
    : '';
  
  // Replace all instances of [STATUS] in callback section carefully
  filled = filled.replace(
    /- Status code del callback via ivanreseller\.com: \[STATUS\]/,
    `- Status code del callback via ivanreseller.com (final): ${callbackStatusCode}${callbackRedirectNote}`
  );
  
  const railwayCallbackResult = jsonReport.comparison?.railwayCallback;
  if (railwayCallbackResult) {
    const railwayCallbackStatus = railwayCallbackResult.finalStatus?.toString() || railwayCallbackResult.status?.toString() || 'N/A';
    filled = filled.replace(
      /- Status code del callback directo a Railway: \[STATUS\]/,
      `- Status code del callback directo a Railway (final): ${railwayCallbackStatus}`
    );
  } else {
    filled = filled.replace(
      /- Status code del callback directo a Railway: \[STATUS\]/,
      '- Status code del callback directo a Railway: N/A (no se probó)'
    );
  }
  
  filled = filled.replace(
    /- Body preview del callback: \[BODY_PREVIEW\]/,
    `- Body preview del callback: ${callbackBodyPreview}`
  );
  
  filled = filled.replace(
    /\*\*Explicación:\*\*\n\[EXPLICACION_DETALLADA\]/,
    `**Explicación:**\n${jsonReport.analysis.callbackExplanation || 'N/A'}`
  );
  
  // Replace API endpoints analysis
  const api502List = productionResults.filter(r => r.is502).map(r => `- ${r.name}`).join('\n') || '- Ninguno';
  const apiOKList = productionResults.filter(r => r.pass && (r.name.includes('Auth Status') || r.name.includes('Dashboard Stats') || r.name.includes('Products'))).map(r => `- ${r.name}`).join('\n') || '- Ninguno';
  
  filled = filled.replace(/\[LISTA_DE_ENDPOINTS_CON_502\]/g, api502List);
  filled = filled.replace(/\[LISTA_DE_ENDPOINTS_OK\]/g, apiOKList);
  
  const apiStatus = jsonReport.analysis.apiEndpointsStatus === true ?
    '- [x] ✅ **ACEPTABLE** - Todos los endpoints responden 200/401/403 (sin 502)' :
    jsonReport.analysis.apiEndpointsStatus === false ?
    '- [x] ❌ **NO ACEPTABLE** - Hay endpoints con 502 que deben funcionar' :
    '- [x] ⚠️ **PARCIAL** - Algunos endpoints tienen 502 pero otros funcionan';
  
  filled = filled.replace(
    /- \[ \] ✅ \*\*ACEPTABLE\*\* - Todos los endpoints responden 200\/401\/403 \(sin 502\)[\s\S]*?- \[ \] ⚠️ \*\*PARCIAL\*\* - Algunos endpoints tienen 502 pero otros funcionan/,
    apiStatus
  );
  
  // Replace API endpoints explanation (second occurrence)
  const callbackExplanationIdx = filled.indexOf('**Explicación:**\n[EXPLICACION_DETALLADA]', filled.indexOf('### 1. Callback llega al backend?'));
  if (callbackExplanationIdx >= 0) {
    filled = filled.substring(0, callbackExplanationIdx) + 
             `**Explicación:**\n${jsonReport.analysis.callbackExplanation || 'N/A'}` +
             filled.substring(callbackExplanationIdx + '**Explicación:**\n[EXPLICACION_DETALLADA]'.length);
  }
  
  const apiExplanationIdx = filled.indexOf('**Explicación:**\n[EXPLICACION_DETALLADA]', filled.indexOf('### 2. Estado de /api/* endpoints'));
  if (apiExplanationIdx >= 0) {
    filled = filled.substring(0, apiExplanationIdx) + 
             `**Explicación:**\n${jsonReport.analysis.apiEndpointsExplanation || 'N/A'}` +
             filled.substring(apiExplanationIdx + '**Explicación:**\n[EXPLICACION_DETALLADA]'.length);
  }
  
  // Replace recommendation
  const recommendationText = jsonReport.recommendation === 'GO' ? 
    '- [x] ✅ **GO** - Todo funciona, proceder con validación OAuth completa' :
    jsonReport.recommendation === 'HOLD' ?
    '- [x] ⚠️ **HOLD** - Problemas menores, necesita fix antes de proceder' :
    '- [x] ❌ **NO GO** - Problemas críticos, no proceder hasta resolver';
  
  filled = filled.replace(
    /- \[ \] ✅ \*\*GO\*\* - Todo funciona, proceder con validación OAuth completa[\s\S]*?- \[ \] ❌ \*\*NO GO\*\* - Problemas críticos, no proceder hasta resolver/,
    recommendationText
  );
  
  // Replace final decision reason
  const decisionReason = jsonReport.overallPass ? 
    'Todos los endpoints pasaron las validaciones endurecidas.' :
    `Fallo en: ${jsonReport.results.filter(r => !r.pass).map(r => r.name).join(', ')}`;
  
  filled = filled.replace(
    /\*\*Razón:\*\*\n\[RAZON_DE_LA_DECISION\]/,
    `**Razón:**\n${decisionReason}`
  );
  
  // Replace next step
  const nextStep = jsonReport.recommendation === 'GO' ?
    'Proceder con validación OAuth completa siguiendo el checklist go-live.' :
    'Revisar y corregir los problemas identificados antes de proceder.';
  
  filled = filled.replace(
    /\*\*Próximo paso:\*\* \[SIGUIENTE_ACCION\]/,
    `**Próximo paso:** ${nextStep}`
  );
  
  return filled;
}

async function main() {
  const timestamp = new Date().toISOString();
  
  log('\n🚀 Production Smoke Test - AliExpress Dropshipping OAuth Validation (HARDENED GATE)', 'blue');
  log(`Timestamp: ${timestamp}`, 'cyan');
  log(`Production Domain: ${PRODUCTION_DOMAIN}`, 'cyan');
  log(`Railway URL: ${RAILWAY_URL}`, 'cyan');
  
  const results = [];
  const endpoints502 = [];
  
  // Test endpoints through production domain
  const productionTests = [
    {
      name: 'Health Check',
      url: `https://${PRODUCTION_DOMAIN}/api/health`,
      expectedStatus: 200,
    },
    {
      name: 'Auth Status',
      url: `https://${PRODUCTION_DOMAIN}/api/auth-status`,
    },
    {
      name: 'Dashboard Stats',
      url: `https://${PRODUCTION_DOMAIN}/api/dashboard/stats`,
    },
    {
      name: 'Products',
      url: `https://${PRODUCTION_DOMAIN}/api/products`,
    },
    {
      name: 'AliExpress Callback (via Vercel rewrite)',
      url: `https://${PRODUCTION_DOMAIN}/aliexpress/callback?code=test&state=test`,
    },
    {
      name: 'AliExpress OAuth Debug',
      url: `https://${PRODUCTION_DOMAIN}/api/marketplace-oauth/aliexpress/oauth/debug`,
    },
  ];
  
  for (const test of productionTests) {
    const result = await testEndpoint(test.name, test.url, test);
    results.push({ ...result, source: 'production' });
    
    if (result.is502) {
      endpoints502.push(result);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // If any endpoint returned 502, test directly against Railway
  if (endpoints502.length > 0) {
    log(`\n\n${'='.repeat(80)}`, 'yellow');
    log(`⚠️  502 ERRORS DETECTED - Testing directly against Railway`, 'yellow');
    log(`${'='.repeat(80)}`, 'yellow');
    
    const railwayTests = [
      {
        name: 'Railway Health Check (direct)',
        url: `https://${RAILWAY_URL}/api/health`,
        expectedStatus: 200,
      },
      {
        name: 'Railway AliExpress Callback (direct)',
        url: `https://${RAILWAY_URL}/aliexpress/callback?code=test&state=test`,
      },
    ];
    
    for (const test of railwayTests) {
      const result = await testEndpoint(test.name, test.url, test);
      results.push({ ...result, source: 'railway-direct' });
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Generate JSON report
  const jsonReport = generateJSONReport(results, timestamp);
  
  // Ensure _smoke directory exists
  const smokeDir = path.join(PROJECT_ROOT, 'docs', '_smoke');
  if (!fs.existsSync(smokeDir)) {
    fs.mkdirSync(smokeDir, { recursive: true });
  }
  
  // Write JSON report
  const jsonPath = path.join(smokeDir, 'last-smoke.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  log(`\n📄 JSON report written: ${jsonPath}`, 'cyan');
  
  // Generate filled markdown report
  const templatePath = path.join(PROJECT_ROOT, 'docs', 'ALIEXPRESS_DROPSHIPPING_OAUTH_PROD_VALIDATION_REPORT.md');
  const filledReport = generateFilledReport(jsonReport, templatePath);
  const filledReportPath = path.join(PROJECT_ROOT, 'docs', 'ALIEXPRESS_DROPSHIPPING_OAUTH_PROD_VALIDATION_REPORT.FILLED.md');
  fs.writeFileSync(filledReportPath, filledReport);
  log(`📄 Filled report written: ${filledReportPath}`, 'cyan');
  
  // Summary
  log(`\n\n${'='.repeat(80)}`, 'blue');
  log(`📊 SUMMARY`, 'blue');
  log(`${'='.repeat(80)}`, 'blue');
  
  const passed = results.filter(r => r.pass);
  const failed = results.filter(r => !r.pass);
  const fiveOhTwo = results.filter(r => r.is502);
  
  log(`\n✅ Passed: ${passed.length}/${results.length}`, passed.length === results.length ? 'green' : 'yellow');
  log(`❌ Failed: ${failed.length}/${results.length}`, failed.length > 0 ? 'red' : 'green');
  log(`🔴 502 Errors: ${fiveOhTwo.length}`, fiveOhTwo.length > 0 ? 'red' : 'green');
  log(`📊 Overall Status: ${jsonReport.overallStatus}`, jsonReport.overallPass ? 'green' : 'red');
  log(`🎯 Recommendation: ${jsonReport.recommendation}`, jsonReport.recommendation === 'GO' ? 'green' : jsonReport.recommendation === 'HOLD' ? 'yellow' : 'red');
  
  if (failed.length > 0) {
    log(`\n📋 Failed Endpoints:`, 'yellow');
    failed.forEach(r => {
      log(`  - ${r.name}: ${r.failReason}`, 'red');
    });
  }
  
  // Exit code
  const exitCode = jsonReport.overallPass ? 0 : 1;
  log(`\n\nExit code: ${exitCode}`, exitCode === 0 ? 'green' : 'red');
  
  process.exit(exitCode);
}

main().catch((error) => {
  log(`\n❌ FATAL ERROR: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
