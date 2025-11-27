/**
 * Script para configurar automáticamente las APIs desde APIS.txt
 * 
 * Este script lee las credenciales del archivo APIS.txt y las configura
 * en el sistema como si el usuario las hubiera ingresado manualmente.
 * 
 * Uso:
 *   cd backend && node scripts/configure-apis-from-file.js [userId] [username] [password]
 * 
 * Ejemplo:
 *   cd backend && node scripts/configure-apis-from-file.js 1 admin admin123
 */

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

// Importar servicios TypeScript compilados o usar ts-node
async function initialize() {
  // Intentar cargar módulos ES6 primero
  try {
    const prismaModule = await import('../dist/config/database.js');
    const credentialsModule = await import('../dist/services/credentials-manager.service.js');
    const authModule = await import('../dist/services/auth.service.js');
    
    return {
      prisma: prismaModule.prisma,
      CredentialsManager: credentialsModule.CredentialsManager,
      AuthService: authModule.AuthService
    };
  } catch (error) {
    // Si no están compilados, usar require con ts-node/register
    require('ts-node/register');
    const prismaModule = require('../src/config/database');
    const credentialsModule = require('../src/services/credentials-manager.service');
    const authModule = require('../src/services/auth.service');
    
    return {
      prisma: prismaModule.prisma,
      CredentialsManager: credentialsModule.CredentialsManager,
      AuthService: authModule.AuthService
    };
  }
}

const APIS_FILE_PATH = path.join(__dirname, '../../APIS.txt');

/**
 * Parsear archivo APIS.txt
 */
function parseAPISFile() {
  console.log('📖 Leyendo archivo APIS.txt...\n');
  const content = fs.readFileSync(APIS_FILE_PATH, 'utf-8');
  const lines = content.split('\n');
  
  const apis = {};
  let currentAPI = null;
  let environment = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (line.startsWith('#')) {
      const lower = line.toLowerCase();
      if (lower.includes('sandbox:') && currentAPI === 'paypal') environment = 'sandbox';
      if (lower.includes('live:') && currentAPI === 'paypal') environment = 'production';
      continue;
    }
    
    if (!line) continue;

    const lower = line.toLowerCase();
    
    // eBay
    if (lower.includes('ebay')) {
      if (lower.includes('sandbox')) {
        currentAPI = 'ebay';
        environment = 'sandbox';
        const key = `ebay_sandbox`;
        if (!apis[key]) apis[key] = { apiName: 'ebay', environment: 'sandbox', credentials: {} };
      } else if (lower.includes('producción') || lower.includes('production')) {
        currentAPI = 'ebay';
        environment = 'production';
        const key = `ebay_production`;
        if (!apis[key]) apis[key] = { apiName: 'ebay', environment: 'production', credentials: {} };
      }
      continue;
    }
    
    // PayPal
    if (lower.includes('paypal')) {
      currentAPI = 'paypal';
      environment = environment || 'production';
      const key = `paypal_${environment}`;
      if (!apis[key]) apis[key] = { apiName: 'paypal', environment, credentials: {} };
      continue;
    }
    
    // Groq
    if (lower.includes('groq') && !lower.includes(':')) {
      currentAPI = 'groq';
      environment = null;
      if (!apis.groq) apis.groq = { apiName: 'groq', environment: 'production', credentials: {} };
      continue;
    }
    
    // ScraperAPI
    if (lower.includes('scraperapi') && !lower.includes(':')) {
      currentAPI = 'scraperapi';
      environment = null;
      if (!apis.scraperapi) apis.scraperapi = { apiName: 'scraperapi', environment: 'production', credentials: {} };
      continue;
    }
    
    // ZenRows
    if (lower.includes('zenrows') && !lower.includes(':')) {
      currentAPI = 'zenrows';
      environment = null;
      if (!apis.zenrows) apis.zenrows = { apiName: 'zenrows', environment: 'production', credentials: {} };
      continue;
    }

    // Parsear campos
    if (currentAPI) {
      const key = environment ? `${currentAPI}_${environment}` : currentAPI;
      if (!apis[key]) {
        apis[key] = {
          apiName: currentAPI,
          environment: environment || 'production',
          credentials: {}
        };
      }

      let fieldName = null;
      let value = null;

      if (line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const fieldPart = line.substring(0, colonIndex).trim().toLowerCase();
        value = line.substring(colonIndex + 1).trim();
        
        if (currentAPI === 'ebay') {
          if (fieldPart.includes('app id') || fieldPart.includes('client id')) fieldName = 'appId';
          else if (fieldPart.includes('dev id')) fieldName = 'devId';
          else if (fieldPart.includes('cert id') || fieldPart.includes('client secret')) fieldName = 'certId';
          else if (fieldPart.includes('redirect uri') || fieldPart.includes('runame')) fieldName = 'redirectUri';
        } else if (currentAPI === 'paypal') {
          if (fieldPart.includes('client id')) fieldName = 'clientId';
          else if (fieldPart.includes('client secret') || fieldPart.includes('secret key')) fieldName = 'clientSecret';
        } else {
          if (fieldPart.includes('api key') || fieldPart.includes('apikey')) fieldName = 'apiKey';
        }
      } else {
        // Valores directos
        if (line.startsWith('gsk_') || line.startsWith('sk-') || line.startsWith('AIza') || line.startsWith('dcf') || line.match(/^[a-f0-9]{32,}$/i)) {
          fieldName = 'apiKey';
          value = line;
        } else if (line.includes('-') && line.length > 20 && !line.includes(' ')) {
          if (currentAPI === 'ebay' && !apis[key].credentials.appId) {
            fieldName = 'appId';
            value = line;
          } else if (currentAPI === 'paypal' && !apis[key].credentials.clientId) {
            fieldName = 'clientId';
            value = line;
          }
        }
      }

      if (fieldName && value) {
        apis[key].credentials[fieldName] = value;
      }
    }
  }

  return apis;
}

/**
 * Configurar APIs
 */
async function configureAPIs(userId, username, password) {
  console.log(`\n🔧 Configurando APIs para usuario ${userId}...\n`);
  
  const { AuthService, CredentialsManager } = await initialize();
  const authService = new AuthService();
  
  // Autenticar
  try {
    const authResult = await authService.login(username, password);
    console.log(`✅ Autenticado como: ${authResult.user.username} (${authResult.user.role})\n`);
  } catch (error) {
    console.error(`❌ Error de autenticación: ${error.message}`);
    process.exit(1);
  }

  const apis = parseAPISFile();
  const results = [];

  for (const [key, apiConfig] of Object.entries(apis)) {
    const { apiName, environment, credentials } = apiConfig;

    if (!credentials || Object.keys(credentials).length === 0) {
      console.log(`⚠️  ${apiName} (${environment || 'default'}): Sin credenciales`);
      continue;
    }

    try {
      console.log(`📝 Configurando ${apiName} (${environment || 'default'})...`);

      let finalCredentials = {};

      if (apiName === 'ebay') {
        finalCredentials = {
          appId: credentials.appId,
          devId: credentials.devId,
          certId: credentials.certId,
          redirectUri: credentials.redirectUri,
          sandbox: environment === 'sandbox'
        };
        
        if (!finalCredentials.appId || !finalCredentials.devId || !finalCredentials.certId) {
          throw new Error('Faltan campos requeridos');
        }
      } else if (apiName === 'paypal') {
        finalCredentials = {
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          environment: environment === 'sandbox' ? 'sandbox' : 'live'
        };
        
        if (!finalCredentials.clientId || !finalCredentials.clientSecret) {
          throw new Error('Faltan campos requeridos');
        }
      } else {
        finalCredentials = { apiKey: credentials.apiKey };
        if (!finalCredentials.apiKey) throw new Error('Falta apiKey');
      }

      await CredentialsManager.saveCredentials(
        userId,
        apiName,
        finalCredentials,
        environment || 'production',
        { scope: 'user' }
      );

      await CredentialsManager.toggleCredentials(
        userId,
        apiName,
        environment || 'production',
        'user',
        true
      );

      console.log(`✅ ${apiName} (${environment || 'default'}): Configurado`);
      results.push({ api: apiName, environment, status: 'success' });

    } catch (error) {
      console.log(`❌ ${apiName} (${environment || 'default'}): ${error.message}`);
      results.push({ api: apiName, environment, status: 'error', error: error.message });
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`\n📊 Resumen: ✅ ${results.filter(r => r.status === 'success').length} exitosos, ❌ ${results.filter(r => r.status === 'error').length} errores`);
  return results;
}

// Ejecutar
const userId = parseInt(process.argv[2] || '1');
const username = process.argv[3] || process.env.ADMIN_USERNAME || 'admin';
const password = process.argv[4] || process.env.ADMIN_PASSWORD || 'admin123';

configureAPIs(userId, username, password)
  .then(() => {
    console.log('\n✨ Proceso completado');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  });
