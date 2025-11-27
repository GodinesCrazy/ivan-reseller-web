/**
 * Script TypeScript para configurar automáticamente las APIs desde APIS.txt
 * 
 * Este script usa directamente los servicios del backend para guardar
 * las credenciales, como si el usuario las hubiera ingresado manualmente.
 * 
 * Uso:
 *   cd backend && npx tsx scripts/configure-apis-direct-ts.ts [userId] [username] [password]
 * 
 * Ejemplo:
 *   cd backend && npx tsx scripts/configure-apis-direct-ts.ts 1 admin admin123
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/config/database';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { AuthService } from '../src/services/auth.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APIS_FILE_PATH = path.join(__dirname, '../../APIS.txt');

interface APIConfig {
  apiName: string;
  environment: string;
  credentials: Record<string, any>;
}

/**
 * Leer y parsear el archivo APIS.txt
 */
function parseAPISFile(): Record<string, APIConfig> {
  console.log('📖 Leyendo archivo APIS.txt...\n');
  const content = fs.readFileSync(APIS_FILE_PATH, 'utf-8');
  const lines = content.split('\n');
  
  const apis: Record<string, APIConfig> = {};
  let currentAPI: string | null = null;
  let environment: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Ignorar comentarios (excepto los que indican ambiente)
    if (line.startsWith('#')) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('sandbox:') && currentAPI === 'paypal') {
        environment = 'sandbox';
      } else if (lowerLine.includes('live:') && currentAPI === 'paypal') {
        environment = 'production';
      }
      continue;
    }
    
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    
    // Detectar eBay
    if (lowerLine.includes('ebay')) {
      if (lowerLine.includes('sandbox') || lowerLine.includes('sandbox')) {
        currentAPI = 'ebay';
        environment = 'sandbox';
      } else if (lowerLine.includes('producción') || lowerLine.includes('production')) {
        currentAPI = 'ebay';
        environment = 'production';
      }
      
      if (currentAPI === 'ebay' && environment) {
        const key = `ebay_${environment}`;
        if (!apis[key]) {
          apis[key] = {
            apiName: 'ebay',
            environment,
            credentials: {}
          };
        }
      }
      continue;
    }
    
    // Detectar PayPal
    if (lowerLine.includes('paypal')) {
      currentAPI = 'paypal';
      environment = environment || 'production';
      const key = `paypal_${environment}`;
      if (!apis[key]) {
        apis[key] = {
          apiName: 'paypal',
          environment,
          credentials: {}
        };
      }
      continue;
    }
    
    // Detectar Groq
    if (lowerLine.includes('groq')) {
      currentAPI = 'groq';
      environment = null;
      if (!apis.groq) {
        apis.groq = {
          apiName: 'groq',
          environment: 'production',
          credentials: {}
        };
      }
      continue;
    }
    
    // Detectar ScraperAPI
    if (lowerLine.includes('scraperapi')) {
      currentAPI = 'scraperapi';
      environment = null;
      if (!apis.scraperapi) {
        apis.scraperapi = {
          apiName: 'scraperapi',
          environment: 'production',
          credentials: {}
        };
      }
      continue;
    }
    
    // Detectar ZenRows
    if (lowerLine.includes('zenrows')) {
      currentAPI = 'zenrows';
      environment = null;
      if (!apis.zenrows) {
        apis.zenrows = {
          apiName: 'zenrows',
          environment: 'production',
          credentials: {}
        };
      }
      continue;
    }

    // Parsear campos de credenciales
    if (currentAPI) {
      const key = environment ? `${currentAPI}_${environment}` : currentAPI;
      
      if (!apis[key]) {
        apis[key] = {
          apiName: currentAPI,
          environment: environment || 'production',
          credentials: {}
        };
      }

      let fieldName: string | null = null;
      let value: string | null = null;

      // Formato: "Campo: Valor"
      if (line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const fieldPart = line.substring(0, colonIndex).trim().toLowerCase();
        value = line.substring(colonIndex + 1).trim();
        
        // Mapear nombres de campos según API
        if (currentAPI === 'ebay') {
          if (fieldPart.includes('app id') || fieldPart.includes('client id')) {
            fieldName = 'appId';
          } else if (fieldPart.includes('dev id')) {
            fieldName = 'devId';
          } else if (fieldPart.includes('cert id') || fieldPart.includes('client secret')) {
            fieldName = 'certId';
          } else if (fieldPart.includes('redirect uri') || fieldPart.includes('runame')) {
            fieldName = 'redirectUri';
          }
        } else if (currentAPI === 'paypal') {
          if (fieldPart.includes('client id')) {
            fieldName = 'clientId';
          } else if (fieldPart.includes('client secret') || fieldPart.includes('secret key')) {
            fieldName = 'clientSecret';
          }
        } else {
          if (fieldPart.includes('api key') || fieldPart.includes('apikey')) {
            fieldName = 'apiKey';
          }
        }
      } else {
        // Valor directo (líneas que empiezan con valores conocidos)
        if (line.startsWith('gsk_') || line.startsWith('sk-') || line.startsWith('AIza') || line.startsWith('dcf')) {
          fieldName = 'apiKey';
          value = line;
        } else if (line.includes('-') && line.length > 20 && !line.includes(' ')) {
          // Posiblemente App ID o Client ID
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
 * Configurar credenciales en el sistema
 */
async function configureAPIs(userId: number, username: string, password: string) {
  console.log(`\n🔧 Configurando APIs para usuario ${userId}...\n`);

  // Autenticarse primero
  const authService = new AuthService();
  let authResult;
  
  try {
    authResult = await authService.login(username, password);
    console.log(`✅ Autenticado como: ${authResult.user.username} (${authResult.user.role})\n`);
  } catch (error: any) {
    console.error(`❌ Error de autenticación: ${error.message}`);
    console.error('   Verifica las credenciales de usuario');
    process.exit(1);
  }

  const apis = parseAPISFile();
  const results: Array<{ api: string; environment: string; status: string; error?: string }> = [];

  // Configurar cada API
  for (const [key, apiConfig] of Object.entries(apis)) {
    const { apiName, environment, credentials } = apiConfig;

    // Validar que haya credenciales
    if (!credentials || Object.keys(credentials).length === 0) {
      console.log(`⚠️  ${apiName} (${environment || 'default'}): Sin credenciales encontradas`);
      continue;
    }

    try {
      console.log(`📝 Configurando ${apiName} (${environment || 'default'})...`);

      // Preparar credenciales según el tipo de API
      let finalCredentials: Record<string, any> = {};

      if (apiName === 'ebay') {
        finalCredentials = {
          appId: credentials.appId,
          devId: credentials.devId,
          certId: credentials.certId,
          redirectUri: credentials.redirectUri,
          sandbox: environment === 'sandbox'
        };
        
        // Validar campos requeridos
        if (!finalCredentials.appId || !finalCredentials.devId || !finalCredentials.certId) {
          throw new Error('Faltan campos requeridos: appId, devId o certId');
        }
        if (!finalCredentials.redirectUri) {
          console.log(`   ⚠️  Advertencia: Redirect URI no encontrado para eBay ${environment}`);
        }
      } else if (apiName === 'paypal') {
        finalCredentials = {
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          environment: environment === 'sandbox' ? 'sandbox' : 'live'
        };
        
        if (!finalCredentials.clientId || !finalCredentials.clientSecret) {
          throw new Error('Faltan campos requeridos: clientId o clientSecret');
        }
      } else {
        // APIs simples con apiKey
        finalCredentials = {
          apiKey: credentials.apiKey
        };
        
        if (!finalCredentials.apiKey) {
          throw new Error('Falta campo requerido: apiKey');
        }
      }

      // Guardar usando CredentialsManager directamente
      await CredentialsManager.saveCredentials(
        userId,
        apiName as any,
        finalCredentials,
        (environment || 'production') as 'sandbox' | 'production',
        {
          scope: 'user'
        }
      );

      // Activar las credenciales
      await CredentialsManager.toggleCredentials(
        userId,
        apiName as any,
        (environment || 'production') as 'sandbox' | 'production',
        'user',
        true
      );

      console.log(`✅ ${apiName} (${environment || 'default'}): Configurado correctamente`);
      results.push({ api: apiName, environment: environment || 'default', status: 'success' });

      // Pequeño delay
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error: any) {
      console.log(`❌ ${apiName} (${environment || 'default'}): Error - ${error.message}`);
      results.push({ api: apiName, environment: environment || 'default', status: 'error', error: error.message });
    }
  }

  // Resumen
  console.log(`\n📊 Resumen:`);
  const success = results.filter(r => r.status === 'success').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`   ✅ Exitosos: ${success}`);
  console.log(`   ❌ Errores: ${errors}`);
  
  if (errors > 0) {
    console.log(`\n⚠️  Errores encontrados:`);
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`   - ${r.api} (${r.environment}): ${r.error}`);
    });
  }

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
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  });

