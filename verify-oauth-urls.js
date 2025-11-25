/**
 * Script de Verificación de URLs OAuth
 * 
 * Este script verifica que todas las URLs de callbacks OAuth estén correctamente
 * configuradas y sean consistentes entre backend, frontend y documentación.
 */

const fs = require('fs');
const path = require('path');

// URLs esperadas según la configuración del backend
const EXPECTED_URLS = {
  ebay: 'https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay',
  mercadolibre: 'https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre'
};

// Rutas del backend esperadas
const EXPECTED_BACKEND_ROUTE = '/api/marketplace-oauth/oauth/callback/:marketplace';

// Archivos a verificar
const FILES_TO_CHECK = [
  'frontend/src/pages/HelpCenter.tsx',
  'docs/MANUAL_END_TO_END_USUARIO_IVAN_RESELLER.md',
  'docs/GUIA_RAPIDA_USO_IVAN_RESELLER.md',
  'ENV_VARIABLES_DOCUMENTATION.md',
  'backend/src/app.ts',
  'backend/src/api/routes/marketplace-oauth.routes.ts'
];

// URLs incorrectas que NO deben aparecer
const FORBIDDEN_PATTERNS = [
  'ivan-reseller-web.vercel.app',
  '/api/marketplace/oauth/callback',  // Ruta incorrecta (sin -oauth)
  'ivanreseller.com/auth/callback'     // Ruta antigua incorrecta
];

let errors = [];
let warnings = [];
let success = [];

console.log('🔍 Verificando URLs OAuth...\n');

// 1. Verificar rutas del backend
console.log('1️⃣ Verificando rutas del backend...');
try {
  const appTs = fs.readFileSync('backend/src/app.ts', 'utf8');
  const routesTs = fs.readFileSync('backend/src/api/routes/marketplace-oauth.routes.ts', 'utf8');
  
  // Verificar que el router esté montado correctamente
  if (appTs.includes("app.use('/api/marketplace-oauth', marketplaceOauthRoutes)")) {
    success.push('✅ Backend: Router montado en /api/marketplace-oauth');
  } else {
    errors.push('❌ Backend: Router no está montado correctamente en app.ts');
  }
  
  // Verificar que la ruta de callback exista
  if (routesTs.includes("router.get('/oauth/callback/:marketplace'")) {
    success.push('✅ Backend: Ruta /oauth/callback/:marketplace encontrada');
  } else {
    errors.push('❌ Backend: Ruta /oauth/callback/:marketplace no encontrada');
  }
  
  // Verificar que soporte eBay y MercadoLibre
  if (routesTs.includes("marketplace === 'ebay'")) {
    success.push('✅ Backend: Soporte para eBay encontrado');
  } else {
    warnings.push('⚠️ Backend: No se encontró soporte explícito para eBay');
  }
  
  if (routesTs.includes("marketplace === 'mercadolibre'")) {
    success.push('✅ Backend: Soporte para MercadoLibre encontrado');
  } else {
    warnings.push('⚠️ Backend: No se encontró soporte explícito para MercadoLibre');
  }
} catch (err) {
  errors.push(`❌ Error leyendo archivos del backend: ${err.message}`);
}

// 2. Verificar documentación
console.log('\n2️⃣ Verificando documentación...');
FILES_TO_CHECK.forEach(file => {
  if (!fs.existsSync(file)) {
    warnings.push(`⚠️ Archivo no encontrado: ${file}`);
    return;
  }
  
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // Verificar URLs de callback de eBay (solo callbacks, no APIs externas)
    if (content.includes(EXPECTED_URLS.ebay)) {
      success.push(`✅ ${file}: URL de callback de eBay correcta`);
    } else {
      // Buscar URLs de callback de eBay (debe contener "callback" y "ebay")
      const ebayCallbackMatches = content.match(/https?:\/\/[^\s\)]+callback[^\s\)]*ebay[^\s\)]*/gi);
      if (ebayCallbackMatches) {
        ebayCallbackMatches.forEach(match => {
          if (!match.includes(EXPECTED_URLS.ebay)) {
            errors.push(`❌ ${file}: URL de callback de eBay incorrecta: ${match.substring(0, 80)}...`);
          }
        });
      } else if (file.includes('HelpCenter') || file.includes('MANUAL') || file.includes('GUIA')) {
        // Solo advertir en archivos de documentación de usuario
        warnings.push(`⚠️ ${file}: No se encontró URL de callback de eBay en documentación`);
      }
    }
    
    // Verificar URLs de callback de MercadoLibre (solo callbacks, no APIs externas)
    if (content.includes(EXPECTED_URLS.mercadolibre)) {
      success.push(`✅ ${file}: URL de callback de MercadoLibre correcta`);
    } else {
      // Buscar URLs de callback de MercadoLibre (debe contener "callback" y "mercadolibre")
      const mlCallbackMatches = content.match(/https?:\/\/[^\s\)]+callback[^\s\)]*mercadolibre[^\s\)]*/gi);
      if (mlCallbackMatches) {
        mlCallbackMatches.forEach(match => {
          if (!match.includes(EXPECTED_URLS.mercadolibre)) {
            errors.push(`❌ ${file}: URL de callback de MercadoLibre incorrecta: ${match.substring(0, 80)}...`);
          }
        });
      } else if (file.includes('HelpCenter') || file.includes('MANUAL') || file.includes('GUIA')) {
        // Solo advertir en archivos de documentación de usuario
        warnings.push(`⚠️ ${file}: No se encontró URL de callback de MercadoLibre en documentación`);
      }
    }
    
    // Verificar patrones prohibidos
    FORBIDDEN_PATTERNS.forEach(pattern => {
      if (content.includes(pattern)) {
        errors.push(`❌ ${file}: Patrón prohibido encontrado: ${pattern}`);
      }
    });
    
  } catch (err) {
    errors.push(`❌ Error leyendo ${file}: ${err.message}`);
  }
});

// 3. Verificar consistencia de dominio
console.log('\n3️⃣ Verificando consistencia de dominio...');
FILES_TO_CHECK.forEach(file => {
  if (!fs.existsSync(file)) return;
  
  try {
    const content = fs.readFileSync(file, 'utf8');
    const domainMatches = content.match(/https?:\/\/([^\s\/\)]+)/gi);
    
    if (domainMatches) {
      domainMatches.forEach(match => {
        if (match.includes('ivanreseller.com') && !match.includes('www.ivanreseller.com') && match.includes('callback')) {
          // Permitir ivanreseller.com sin www, pero advertir
          if (!match.includes('www.')) {
            warnings.push(`⚠️ ${file}: URL sin www encontrada: ${match.substring(0, 60)}...`);
          }
        }
      });
    }
  } catch (err) {
    // Ignorar errores de lectura aquí
  }
});

// Resumen
console.log('\n' + '='.repeat(60));
console.log('📊 RESUMEN DE VERIFICACIÓN');
console.log('='.repeat(60));

if (success.length > 0) {
  console.log('\n✅ ÉXITOS:');
  success.forEach(msg => console.log(`   ${msg}`));
}

if (warnings.length > 0) {
  console.log('\n⚠️ ADVERTENCIAS:');
  warnings.forEach(msg => console.log(`   ${msg}`));
}

if (errors.length > 0) {
  console.log('\n❌ ERRORES:');
  errors.forEach(msg => console.log(`   ${msg}`));
  console.log('\n❌ VERIFICACIÓN FALLIDA: Se encontraron errores que deben corregirse.');
  process.exit(1);
} else {
  console.log('\n✅ VERIFICACIÓN EXITOSA: Todas las URLs OAuth están correctamente configuradas.');
  process.exit(0);
}

