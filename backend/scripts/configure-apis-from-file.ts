/**
 * Script para configurar automáticamente las APIs desde APIS.txt
 * 
 * Este script lee las credenciales del archivo APIS.txt y las configura
 * en el sistema como si el usuario las hubiera ingresado manualmente.
 * 
 * Uso:
 *   cd backend && npm run configure-apis [userId] [username] [password]
 * 
 * Ejemplo:
 *   cd backend && npm run configure-apis 1 admin admin123
 * 
 * O directamente:
 *   cd backend && npx tsx scripts/configure-apis-from-file.ts 1 admin admin123
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/config/database';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { AuthService } from '../src/services/auth.service';
import { logger } from '../src/config/logger';

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
  
  if (!fs.existsSync(APIS_FILE_PATH)) {
    throw new Error(`Archivo APIS.txt no encontrado en: ${APIS_FILE_PATH}`);
  }

  const content = fs.readFileSync(APIS_FILE_PATH, 'utf-8');
  const lines = content.split('\n');
  
  const apis: Record<string, APIConfig> = {};
  let currentAPI: string | null = null;
  let environment: string | null = null;
  let nextLineIsValue = false;
  let lastFieldName: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
    
    // Ignorar comentarios (excepto los que indican ambiente)
    if (line.startsWith('#')) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('sandbox:') && currentAPI === 'paypal') {
        environment = 'sandbox';
        const key = `paypal_sandbox`;
        if (!apis[key]) {
          apis[key] = {
            apiName: 'paypal',
            environment: 'sandbox',
            credentials: {}
          };
        }
      } else if (lowerLine.includes('live:') && currentAPI === 'paypal') {
        environment = 'production';
        const key = `paypal_production`;
        if (!apis[key]) {
          apis[key] = {
            apiName: 'paypal',
            environment: 'production',
            credentials: {}
          };
        }
      }
      continue;
    }
    
    if (!line) {
      // Si hay una línea vacía, puede ser separador entre secciones
      if (currentAPI && lastFieldName && nextLine && !nextLine.startsWith('#') && !nextLine.includes(':')) {
        // La siguiente línea puede ser un valor
        nextLineIsValue = true;
      }
      continue;
    }

    const lowerLine = line.toLowerCase();
    
    // Detectar eBay
    if (lowerLine.includes('ebay')) {
      if (lowerLine.includes('sandbox')) {
        currentAPI = 'ebay';
        environment = 'sandbox';
        const key = `ebay_sandbox`;
        if (!apis[key]) {
          apis[key] = {
            apiName: 'ebay',
            environment: 'sandbox',
            credentials: {}
          };
        }
      } else if (lowerLine.includes('producción') || lowerLine.includes('production')) {
        currentAPI = 'ebay';
        environment = 'production';
        const key = `ebay_production`;
        if (!apis[key]) {
          apis[key] = {
            apiName: 'ebay',
            environment: 'production',
            credentials: {}
          };
        }
      }
      lastFieldName = null;
      continue;
    }
    
    // Detectar PayPal
    if (lowerLine.includes('paypal') && !lowerLine.includes(':')) {
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
      lastFieldName = null;
      continue;
    }
    
    // Detectar Groq (línea "groq :" seguida de valor)
    if (lowerLine.includes('groq') && line.includes(':')) {
      currentAPI = 'groq';
      environment = null;
      if (!apis.groq) {
        apis.groq = {
          apiName: 'groq',
          environment: 'production',
          credentials: {}
        };
      }
      // Extraer valor si está en la misma línea
      const colonIndex = line.indexOf(':');
      const value = line.substring(colonIndex + 1).trim();
      if (value) {
        apis.groq.credentials.apiKey = value;
      }
      lastFieldName = 'apiKey';
      continue;
    }
    
    // Detectar OpenAI (línea "OpenAI" seguida de valor en línea siguiente)
    if (lowerLine.includes('openai') && !lowerLine.includes(':')) {
      currentAPI = 'openai';
      environment = null;
      if (!apis.openai) {
        apis.openai = {
          apiName: 'openai',
          environment: 'production',
          credentials: {}
        };
      }
      lastFieldName = 'apiKey';
      continue;
    }
    
    // Detectar Gemini
    if (lowerLine.includes('gemini') && lowerLine.includes('api key')) {
      currentAPI = 'gemini';
      environment = null;
      if (!apis.gemini) {
        apis.gemini = {
          apiName: 'gemini',
          environment: 'production',
          credentials: {}
        };
      }
      // Extraer valor si está en la misma línea
      const colonIndex = line.indexOf(':');
      if (colonIndex > -1) {
        const value = line.substring(colonIndex + 1).trim();
        if (value) {
          apis.gemini.credentials.apiKey = value;
        }
      }
      lastFieldName = 'apiKey';
      continue;
    }
    
    // Detectar ScraperAPI
    if (lowerLine.includes('scraperapi') && lowerLine.includes('key')) {
      currentAPI = 'scraperapi';
      environment = null;
      if (!apis.scraperapi) {
        apis.scraperapi = {
          apiName: 'scraperapi',
          environment: 'production',
          credentials: {}
        };
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex > -1) {
        const value = line.substring(colonIndex + 1).trim();
        if (value) {
          apis.scraperapi.credentials.apiKey = value;
        }
      }
      lastFieldName = 'apiKey';
      continue;
    }
    
    // Detectar ZenRows
    if (lowerLine.includes('zenrows') && lowerLine.includes('api')) {
      currentAPI = 'zenrows';
      environment = null;
      if (!apis.zenrows) {
        apis.zenrows = {
          apiName: 'zenrows',
          environment: 'production',
          credentials: {}
        };
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex > -1) {
        const value = line.substring(colonIndex + 1).trim();
        if (value) {
          apis.zenrows.credentials.apiKey = value;
        }
      }
      lastFieldName = 'apiKey';
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

      // Si la línea anterior indicó que esta es un valor, usar el último fieldName
      if (nextLineIsValue && lastFieldName && !line.includes(':')) {
        fieldName = lastFieldName;
        value = line;
        nextLineIsValue = false;
      }
      // Formato: "Campo: Valor" o "Campo Valor" (sin dos puntos)
      else if (line.includes(':')) {
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
        // Formato sin dos puntos: "Campo Valor"
        // Detectar si la línea contiene un nombre de campo seguido de un valor
        const lowerLine = line.toLowerCase();
        
        if (currentAPI === 'ebay') {
          // eBay: "App ID (Client ID) Valor" - extraer valor después del paréntesis o después de espacios
          if (lowerLine.includes('app id') || lowerLine.includes('client id')) {
            // Intentar extraer el valor que viene después del texto del campo
            const match = line.match(/(?:App ID|Client ID)(?:\s*\([^)]+\))?\s+([A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*)/i);
            if (match && match[1] && !apis[key].credentials.appId) {
              fieldName = 'appId';
              value = match[1];
            }
          }
          // "Dev ID Valor"
          else if (lowerLine.includes('dev id')) {
            const match = line.match(/Dev ID\s+([A-Za-z0-9-]+)/i);
            if (match && match[1] && !apis[key].credentials.devId) {
              fieldName = 'devId';
              value = match[1];
            }
          }
          // "Cert ID (Client Secret) Valor"
          else if (lowerLine.includes('cert id') || lowerLine.includes('client secret')) {
            const match = line.match(/(?:Cert ID|Client Secret)(?:\s*\([^)]+\))?\s+([A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*)/i);
            if (match && match[1] && !apis[key].credentials.certId) {
              fieldName = 'certId';
              value = match[1];
            }
          }
          // "Redirect URI (RuName) Valor"
          else if (lowerLine.includes('redirect uri') || lowerLine.includes('runame')) {
            const match = line.match(/(?:Redirect URI|RuName)(?:\s*\([^)]+\))?\s+([A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*)/i);
            if (match && match[1] && !apis[key].credentials.redirectUri) {
              fieldName = 'redirectUri';
              value = match[1];
            }
          }
          // Valor directo de eBay (formato con guiones, sin espacios, después de un campo)
          else if (line.includes('-') && line.length > 20 && !line.includes(' ') && !line.toLowerCase().includes('app id') && !line.toLowerCase().includes('dev id') && !line.toLowerCase().includes('cert id')) {
            if (!apis[key].credentials.appId && (line.includes('SBX-') || line.includes('PRD-') || line.includes('IVAN') || line.includes('IvanMart-'))) {
              fieldName = 'appId';
              value = line;
            } else if (!apis[key].credentials.devId && line.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
              fieldName = 'devId';
              value = line;
            } else if (!apis[key].credentials.certId && (line.includes('SBX-') || line.includes('PRD-'))) {
              fieldName = 'certId';
              value = line;
            } else if (!apis[key].credentials.redirectUri && line.includes('Ivan_')) {
              fieldName = 'redirectUri';
              value = line;
            }
          }
        } else if (currentAPI === 'paypal') {
          // PayPal: "Client ID Valor" (sin dos puntos)
          if (lowerLine.includes('client id')) {
            const match = line.match(/Client ID\s+([A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*)/i);
            if (match && match[1] && !apis[key].credentials.clientId) {
              fieldName = 'clientId';
              value = match[1];
            }
          }
          // "Secret Key Valor" o "Client Secret Valor"
          else if (lowerLine.includes('secret key') || lowerLine.includes('client secret')) {
            const match = line.match(/(?:Secret Key|Client Secret)\s+([A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*)/i);
            if (match && match[1] && !apis[key].credentials.clientSecret) {
              fieldName = 'clientSecret';
              value = match[1];
            }
          }
          // Valor directo de PayPal (líneas largas sin espacios, que no sean "Client ID" o "Secret Key")
          else if (line.length > 50 && !line.includes(' ') && !lowerLine.includes('client id') && !lowerLine.includes('secret')) {
            if (!apis[key].credentials.clientId && line.length > 50) {
              fieldName = 'clientId';
              value = line;
            } else if (!apis[key].credentials.clientSecret && line.length > 50) {
              fieldName = 'clientSecret';
              value = line;
            }
          }
        }
        
        // Valor directo (líneas que empiezan con valores conocidos)
        // Groq: gsk_...
        if (!fieldName && line.startsWith('gsk_')) {
          fieldName = 'apiKey';
          value = line;
        }
        // OpenAI: sk-...
        else if (!fieldName && line.startsWith('sk-')) {
          fieldName = 'apiKey';
          value = line;
        }
        // Gemini: AIza...
        else if (!fieldName && line.startsWith('AIza')) {
          fieldName = 'apiKey';
          value = line;
        }
        // ScraperAPI: dcf...
        else if (!fieldName && line.startsWith('dcf')) {
          fieldName = 'apiKey';
          value = line;
        }
        // ZenRows: hexadecimal de 40 caracteres
        else if (!fieldName && line.match(/^[a-f0-9]{40}$/i)) {
          fieldName = 'apiKey';
          value = line;
        }
      }

      if (fieldName && value) {
        apis[key].credentials[fieldName] = value;
        lastFieldName = fieldName;
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
      logger.error('Error configuring API', { apiName, environment, error: error.message });
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

console.log(`
╔═══════════════════════════════════════════════════════════╗
║   🔐 Configurador Automático de APIs desde APIS.txt      ║
╚═══════════════════════════════════════════════════════════╝
`);

configureAPIs(userId, username, password)
  .then(() => {
    console.log('\n✨ Proceso completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    logger.error('Fatal error in configure-apis script', { error: error.message, stack: error.stack });
    process.exit(1);
  });
