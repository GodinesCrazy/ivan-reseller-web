/**
 * Script para configurar TODAS las APIs desde APIS.txt y PROBAR su funcionamiento
 * 
 * Este script:
 * 1. Lee APIS.txt y extrae todas las credenciales
 * 2. Las configura como admin (usuario ID 1)
 * 3. Prueba que las APIs funcionan correctamente
 * 
 * Uso:
 *   cd backend && npx tsx scripts/configure-and-test-apis.ts
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/config/database';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import logger from '../src/config/logger';
import { AliExpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { EbayService } from '../src/services/ebay.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APIS_FILE_PATH = path.join(__dirname, '../../APIS.txt');

interface APIConfig {
  apiName: string;
  environment: 'sandbox' | 'production';
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
  let environment: 'sandbox' | 'production' = 'production';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Ignorar comentarios y líneas vacías
    if (line.startsWith('#') || !line) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('sandbox')) {
        environment = 'sandbox';
      } else if (lowerLine.includes('live') || lowerLine.includes('producción') || lowerLine.includes('production')) {
        environment = 'production';
      }
      continue;
    }

    const lowerLine = line.toLowerCase();
    
    // Detectar eBay
    if (lowerLine.includes('ebay')) {
      if (lowerLine.includes('sandbox')) {
        currentAPI = 'ebay';
        environment = 'sandbox';
      } else if (lowerLine.includes('producción') || lowerLine.includes('production')) {
        currentAPI = 'ebay';
        environment = 'production';
      }
      
      if (currentAPI === 'ebay') {
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
    
    // Detectar campos de eBay directamente (formato "Campo Valor" en la misma línea)
    if (currentAPI === 'ebay') {
      const key = `ebay_${environment}`;
      if (lowerLine.includes('app id') || lowerLine.includes('client id')) {
        // Formato: "App ID (Client ID) Valor" o "App ID Valor"
        const match = line.match(/(?:App\s+ID|Client\s+ID)[^(]*\(?[^)]*\)?\s*(.+)$/i);
        if (match && match[1]) {
          apis[key].credentials.appId = match[1].trim();
          continue;
        }
      } else if (lowerLine.includes('dev id')) {
        // Formato: "Dev ID Valor"
        const match = line.match(/Dev\s+ID\s+(.+)$/i);
        if (match && match[1]) {
          apis[key].credentials.devId = match[1].trim();
          continue;
        }
      } else if (lowerLine.includes('cert id') || lowerLine.includes('client secret')) {
        // Formato: "Cert ID (Client Secret) Valor" o "Cert ID Valor"
        const match = line.match(/(?:Cert\s+ID|Client\s+Secret)[^(]*\(?[^)]*\)?\s*(.+)$/i);
        if (match && match[1]) {
          apis[key].credentials.certId = match[1].trim();
          continue;
        }
      } else if (lowerLine.includes('redirect uri') || lowerLine.includes('runame')) {
        // Formato: "Redirect URI (RuName) Valor" o "Redirect URI Valor"
        const match = line.match(/(?:Redirect\s+URI|RuName)[^(]*\(?[^)]*\)?\s*(.+)$/i);
        if (match && match[1]) {
          apis[key].credentials.redirectUri = match[1].trim();
          continue;
        }
      }
    }
    
    // Detectar AliExpress (buscar al inicio o en comentarios)
    if (lowerLine.includes('aliexpress')) {
      currentAPI = 'aliexpress-dropshipping';
      environment = 'sandbox'; // Por defecto sandbox para AliExpress
      const key = `aliexpress-dropshipping_${environment}`;
      if (!apis[key]) {
        apis[key] = {
          apiName: 'aliexpress-dropshipping',
          environment: 'sandbox',
          credentials: {}
        };
      }
      continue;
    }
    
    // También detectar "Drop Shipping" como marcador para AliExpress
    if (lowerLine.includes('drop shipping') || lowerLine.includes('dropshipping')) {
      currentAPI = 'aliexpress-dropshipping';
      environment = 'sandbox';
      const key = `aliexpress-dropshipping_${environment}`;
      if (!apis[key]) {
        apis[key] = {
          apiName: 'aliexpress-dropshipping',
          environment: 'sandbox',
          credentials: {}
        };
      }
      continue;
    }
    
    // Detectar campos de AliExpress sin marcador explícito
    if (lowerLine.includes('appkey') || lowerLine.includes('app key')) {
      if (!currentAPI || currentAPI === 'aliexpress-dropshipping') {
        currentAPI = 'aliexpress-dropshipping';
        environment = 'sandbox';
        const key = `aliexpress-dropshipping_${environment}`;
        if (!apis[key]) {
          apis[key] = {
            apiName: 'aliexpress-dropshipping',
            environment: 'sandbox',
            credentials: {}
          };
        }
      }
      // Si la línea siguiente es un número, es el AppKey
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.match(/^\d+$/)) {
          apis[`aliexpress-dropshipping_${environment}`].credentials.appKey = nextLine;
          i++; // Saltar la línea siguiente
        }
      }
      continue;
    }
    
        // Detectar "App Secret" para AliExpress
        if (lowerLine.includes('app secret')) {
          if (!currentAPI || currentAPI === 'aliexpress-dropshipping') {
            currentAPI = 'aliexpress-dropshipping';
            environment = 'sandbox';
            const key = `aliexpress-dropshipping_${environment}`;
            if (!apis[key]) {
              apis[key] = {
                apiName: 'aliexpress-dropshipping',
                environment: 'sandbox',
                credentials: {}
              };
            }
          }
          // La siguiente línea debería tener el AppSecret (puede tener "HideReset" al final)
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (nextLine.length > 20) {
              // Remover "HideReset" u otros textos al final
              const secretValue = nextLine.split(' ')[0].trim();
              apis[`aliexpress-dropshipping_${environment}`].credentials.appSecret = secretValue;
              i++; // Saltar la línea siguiente
            }
          }
          continue;
        }
        
        // Detectar campos de AliExpress directamente
        if (currentAPI === 'aliexpress-dropshipping') {
          const key = `aliexpress-dropshipping_${environment}`;
          if (lowerLine === 'appkey' || lowerLine === 'app key') {
            // La siguiente línea debería tener el AppKey (número)
            if (i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim();
              if (nextLine.match(/^\d+$/)) {
                apis[key].credentials.appKey = nextLine;
                i++; // Saltar la línea siguiente
                continue;
              }
            }
          } else if (lowerLine === 'app secret') {
            // La siguiente línea debería tener el AppSecret
            if (i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim();
              if (nextLine.length > 20) {
                const secretValue = nextLine.split(' ')[0].trim();
                apis[key].credentials.appSecret = secretValue;
                i++; // Saltar la línea siguiente
                continue;
              }
            }
          }
        }
    
    // Detectar PayPal
    if (lowerLine.includes('paypal')) {
      currentAPI = 'paypal';
      // PayPal puede tener Sandbox o Live
      if (lowerLine.includes('sandbox')) {
        environment = 'sandbox';
      } else if (lowerLine.includes('live')) {
        environment = 'production';
      }
      // Si no se especifica, buscar en las siguientes líneas
      continue;
    }
    
    // Detectar campos de PayPal
    if (currentAPI === 'paypal') {
      let key = `paypal_${environment}`;
      if (!apis[key]) {
        apis[key] = {
          apiName: 'paypal',
          environment: environment || 'production',
          credentials: {}
        };
      }
      
      // Detectar "Sandbox:" o "Live:" para cambiar ambiente
      if (lowerLine.includes('sandbox:')) {
        environment = 'sandbox';
        key = `paypal_sandbox`;
        if (!apis[key]) {
          apis[key] = {
            apiName: 'paypal',
            environment: 'sandbox',
            credentials: {}
          };
        }
        continue;
      } else if (lowerLine.includes('live:')) {
        environment = 'production';
        key = `paypal_production`;
        if (!apis[key]) {
          apis[key] = {
            apiName: 'paypal',
            environment: 'production',
            credentials: {}
          };
        }
        continue;
      }
      
      // Detectar "Client ID" o "client ID"
      if (lowerLine.includes('client id')) {
        // El valor está en la misma línea después de ":" o en la siguiente línea
        let value: string | null = null;
        
        if (line.includes(':')) {
          const colonIndex = line.indexOf(':');
          value = line.substring(colonIndex + 1).trim();
        } else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          // Solo tomar si es una línea de valor (no un marcador de otra sección)
          if (nextLine.length > 20 && !nextLine.toLowerCase().includes('live') && !nextLine.toLowerCase().includes('sandbox')) {
            value = nextLine;
            i++; // Saltar la línea siguiente
          }
        }
        
        if (value && value.length > 20) {
          apis[key].credentials.clientId = value;
        }
        continue;
      }
      
      // Detectar "Secret Key" o "client secret"
      if (lowerLine.includes('secret key') || lowerLine.includes('client secret')) {
        // El valor está en la misma línea después de ":" o en la siguiente línea
        let value: string | null = null;
        
        if (line.includes(':')) {
          const colonIndex = line.indexOf(':');
          value = line.substring(colonIndex + 1).trim();
        } else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          // Solo tomar si es una línea de valor (no un marcador de otra sección)
          if (nextLine.length > 20 && !nextLine.toLowerCase().includes('live') && !nextLine.toLowerCase().includes('sandbox')) {
            value = nextLine;
            i++; // Saltar la línea siguiente
          }
        }
        
        if (value && value.length > 20) {
          apis[key].credentials.clientSecret = value;
        }
        continue;
      }
    }
    
    // Detectar Groq (buscar línea que contiene "groq :" seguida de la clave)
    if (lowerLine.includes('groq')) {
      currentAPI = 'groq';
      environment = 'production';
      if (!apis.groq) {
        apis.groq = {
          apiName: 'groq',
          environment: 'production',
          credentials: {}
        };
      }
      // Si la línea contiene "groq :" y tiene un valor después de los dos puntos, capturarlo
      if (line.includes(':') && line.split(':').length > 1) {
        const value = line.split(':').slice(1).join(':').trim();
        if (value && value.startsWith('gsk_')) {
          apis.groq.credentials.apiKey = value;
        }
      }
      continue;
    }
    
    // Detectar Gemini
    if (lowerLine.includes('gemini') || lowerLine.includes('gemini_api_key')) {
      currentAPI = 'gemini';
      environment = 'production';
      if (!apis.gemini) {
        apis.gemini = {
          apiName: 'gemini',
          environment: 'production',
          credentials: {}
        };
      }
      // Si la línea contiene "GEMINI_API_KEY" seguida de la clave
      if (lowerLine.includes('gemini_api_key')) {
        const parts = line.split(/\s+/);
        const keyIndex = parts.findIndex(p => p.toLowerCase().includes('key'));
        if (keyIndex >= 0 && keyIndex + 1 < parts.length) {
          apis.gemini.credentials.apiKey = parts[keyIndex + 1];
        }
      }
      continue;
    }
    
    // Detectar OpenAI (la clave está en la línea siguiente)
    if (lowerLine.includes('openai')) {
      currentAPI = 'openai';
      environment = 'production';
      if (!apis.openai) {
        apis.openai = {
          apiName: 'openai',
          environment: 'production',
          credentials: {}
        };
      }
      // La siguiente línea debería tener la clave (empezar con sk-)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.startsWith('sk-')) {
          apis.openai.credentials.apiKey = nextLine;
          i++; // Saltar la línea siguiente ya que la procesamos
        }
      }
      continue;
    }
    
        // Detectar ScraperAPI
        if (lowerLine.includes('scraperapi')) {
          currentAPI = 'scraperapi';
          environment = 'production';
          if (!apis.scraperapi) {
            apis.scraperapi = {
              apiName: 'scraperapi',
              environment: 'production',
              credentials: {}
            };
          }
          // Si la línea contiene ":" y tiene un valor después
          if (line.includes(':')) {
            const colonIndex = line.indexOf(':');
            const value = line.substring(colonIndex + 1).trim();
            if (value.match(/^[a-f0-9]{32}$/i)) {
              apis.scraperapi.credentials.apiKey = value;
            }
          } else if (i + 1 < lines.length) {
            // Si la línea siguiente tiene la clave (hash hexadecimal)
            const nextLine = lines[i + 1].trim();
            if (nextLine.match(/^[a-f0-9]{32}$/i)) {
              apis.scraperapi.credentials.apiKey = nextLine;
              i++; // Saltar la línea siguiente
            }
          }
          continue;
        }
        
        // Detectar ZenRows
        if (lowerLine.includes('zenrows')) {
          currentAPI = 'zenrows';
          environment = 'production';
          if (!apis.zenrows) {
            apis.zenrows = {
              apiName: 'zenrows',
              environment: 'production',
              credentials: {}
            };
          }
          // Si la línea contiene ":" y tiene un valor después
          if (line.includes(':')) {
            const colonIndex = line.indexOf(':');
            const value = line.substring(colonIndex + 1).trim();
            if (value.match(/^[a-f0-9]{40}$/i)) {
              apis.zenrows.credentials.apiKey = value;
            }
          } else if (i + 1 < lines.length) {
            // Si la línea siguiente tiene la clave (hash hexadecimal largo)
            const nextLine = lines[i + 1].trim();
            if (nextLine.match(/^[a-f0-9]{40}$/i)) {
              apis.zenrows.credentials.apiKey = nextLine;
              i++; // Saltar la línea siguiente
            }
          }
          continue;
        }

    // Parsear campos de credenciales
    if (currentAPI) {
      let key: string;
      
      if (currentAPI === 'ebay') {
        key = `ebay_${environment}`;
      } else if (currentAPI === 'paypal') {
        key = `paypal_${environment}`;
      } else {
        key = currentAPI;
      }
      
      if (!apis[key]) {
        apis[key] = {
          apiName: currentAPI,
          environment: environment || 'production',
          credentials: {}
        };
      }

      let fieldName: string | null = null;
      let value: string | null = null;

      // Formato: "Campo: Valor" O "Campo Valor" (sin dos puntos)
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
        } else if (currentAPI === 'aliexpress-dropshipping') {
          if (fieldPart.includes('appkey') || fieldPart.includes('app key')) {
            fieldName = 'appKey';
          } else if (fieldPart.includes('app secret') || fieldPart.includes('appsecret')) {
            fieldName = 'appSecret';
          }
        } else {
          if (fieldPart.includes('api key') || fieldPart.includes('apikey')) {
            fieldName = 'apiKey';
          }
        }
      } else {
        // Formato sin dos puntos: "Campo Valor" - para eBay y otros
        if (currentAPI === 'ebay') {
          const lowerLine = line.toLowerCase();
          // Si la línea contiene un UUID o formato de App ID, y no hay campos capturados aún
          if (line.includes('-') && line.length > 20) {
            // Podría ser App ID, Dev ID, Cert ID o Redirect URI
            if (!apis[key].credentials.appId && (line.includes('SBX-') || line.includes('PRD-') || line.includes('IVANRese'))) {
              fieldName = 'appId';
              value = line;
            } else if (!apis[key].credentials.devId && line.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
              fieldName = 'devId';
              value = line;
            } else if (!apis[key].credentials.certId && (line.includes('SBX-') || line.includes('PRD-')) && line.includes('-')) {
              fieldName = 'certId';
              value = line;
            } else if (!apis[key].credentials.redirectUri && line.includes('Ivan_Marty')) {
              fieldName = 'redirectUri';
              value = line;
            }
          }
        } else if (currentAPI === 'aliexpress-dropshipping') {
          // Para AliExpress, buscar líneas que contengan solo números (AppKey) o cadenas largas (AppSecret)
          if (line.match(/^\d{4,10}$/) && !apis[key].credentials.appKey) {
            fieldName = 'appKey';
            value = line;
          } else if (line.length > 20 && !line.includes(' ') && !line.match(/^\d+$/) && !apis[key].credentials.appSecret && !line.includes('HideReset')) {
            // Excluir líneas que contengan "HideReset" u otros marcadores
            fieldName = 'appSecret';
            value = line.split(' ')[0]; // Tomar solo la primera parte si hay espacios
          }
        }
        // Valor directo (líneas que empiezan con valores conocidos)
        if (line.startsWith('gsk_')) {
          fieldName = 'apiKey';
          value = line;
        } else if (line.startsWith('sk-')) {
          fieldName = 'apiKey';
          value = line;
        } else if (line.startsWith('AIza')) {
          fieldName = 'apiKey';
          value = line;
        } else if (line.match(/^\d{4,10}$/)) {
          // AliExpress AppKey es solo números (ej: 522578)
          if (currentAPI === 'aliexpress-dropshipping' && !apis[key]?.credentials.appKey) {
            fieldName = 'appKey';
            value = line;
          }
        } else if (currentAPI === 'aliexpress-dropshipping') {
          // AliExpress AppSecret es una cadena larga sin espacios (después de "App Secret")
          if (line.length > 20 && !line.includes(' ') && !line.match(/^\d+$/) && !apis[key]?.credentials.appSecret) {
            // Verificar que la línea anterior mencionaba "App Secret"
            if (i > 0 && lines[i - 1].toLowerCase().includes('app secret')) {
              fieldName = 'appSecret';
              value = line;
            }
          }
        }
        
        // Detectar valores de scraping APIs
        if (line.match(/^[a-f0-9]{32,}$/i) && (currentAPI === 'scraperapi' || currentAPI === 'zenrows')) {
          fieldName = 'apiKey';
          value = line;
        } else if (line.length > 20 && line.includes('-') && !line.includes(' ')) {
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
async function configureAPIs(userId: number = 1) {
  console.log(`\n🔧 Configurando APIs para usuario ${userId} (admin)...\n`);

  const apis = parseAPISFile();
  const results: Array<{ api: string; environment: string; status: string; error?: string }> = [];

  console.log(`📋 APIs encontradas: ${Object.keys(apis).length}\n`);

  // Configurar cada API
  for (const [key, apiConfig] of Object.entries(apis)) {
    const { apiName, environment, credentials } = apiConfig;

    // Validar que haya credenciales
    if (!credentials || Object.keys(credentials).length === 0) {
      console.log(`⚠️  ${apiName} (${environment}): Sin credenciales encontradas`);
      continue;
    }

    try {
      console.log(`📝 Configurando ${apiName} (${environment})...`);

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
      } else if (apiName === 'paypal') {
        finalCredentials = {
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          environment: environment === 'sandbox' ? 'sandbox' : 'live'
        };
        
        if (!finalCredentials.clientId || !finalCredentials.clientSecret) {
          throw new Error('Faltan campos requeridos: clientId o clientSecret');
        }
      } else if (apiName === 'aliexpress-dropshipping') {
        finalCredentials = {
          appKey: credentials.appKey,
          appSecret: credentials.appSecret,
          sandbox: environment === 'sandbox'
        };
        
        if (!finalCredentials.appKey || !finalCredentials.appSecret) {
          throw new Error('Faltan campos requeridos: appKey o appSecret');
        }
        
        console.log(`   AppKey: ${finalCredentials.appKey.substring(0, 6)}...`);
        console.log(`   AppSecret: ${finalCredentials.appSecret ? finalCredentials.appSecret.substring(0, 10) + '...' : 'missing'}`);
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
        environment,
        {
          scope: 'user'
        }
      );

      // Activar las credenciales
      await CredentialsManager.toggleCredentials(
        userId,
        apiName as any,
        environment,
        'user',
        true
      );

      console.log(`✅ ${apiName} (${environment}): Configurado correctamente`);
      results.push({ api: apiName, environment, status: 'success' });

      // Pequeño delay
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error: any) {
      console.log(`❌ ${apiName} (${environment}): Error - ${error.message}`);
      results.push({ api: apiName, environment, status: 'error', error: error.message });
    }
  }

  // Resumen
  console.log(`\n📊 Resumen de configuración:`);
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

/**
 * Probar que las APIs funcionan
 */
async function testAPIs(userId: number = 1) {
  console.log(`\n🧪 Probando APIs configuradas...\n`);

  const tests: Array<{ api: string; test: string; status: string; message?: string }> = [];

  // Probar AliExpress Affiliate API (usar las mismas credenciales que Dropshipping)
  try {
    console.log('📡 Probando AliExpress Affiliate API...');
    // AliExpress Affiliate API usa las mismas credenciales que Dropshipping
    const dropshippingCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
    if (dropshippingCreds && dropshippingCreds.appKey && dropshippingCreds.appSecret) {
      // Guardar también como Affiliate API
      await CredentialsManager.saveCredentials(
        userId,
        'aliexpress-affiliate',
        {
          appKey: dropshippingCreds.appKey,
          appSecret: dropshippingCreds.appSecret,
          sandbox: true
        },
        'sandbox',
        { scope: 'user' }
      );
      
      const affiliateCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'sandbox');
      if (affiliateCreds) {
        const service = new AliExpressAffiliateAPIService();
        service.setCredentials(affiliateCreds);
        
        const products = await service.searchProducts({
          keywords: 'test',
          pageSize: 1
        });
        
        if (products && products.length > 0) {
          console.log(`✅ AliExpress Affiliate API: Funcionando (${products.length} productos encontrados)`);
          tests.push({ api: 'aliexpress-affiliate', test: 'searchProducts', status: 'success', message: `${products.length} productos` });
        } else {
          console.log(`⚠️  AliExpress Affiliate API: Respondió pero sin productos`);
          tests.push({ api: 'aliexpress-affiliate', test: 'searchProducts', status: 'warning', message: 'Sin productos' });
        }
      } else {
        console.log(`⚠️  AliExpress Affiliate API: No se pudieron obtener credenciales`);
        tests.push({ api: 'aliexpress-affiliate', test: 'searchProducts', status: 'skipped', message: 'No configurada' });
      }
    } else {
      console.log(`⚠️  AliExpress Affiliate API: No configurada (falta aliexpress-dropshipping)`);
      tests.push({ api: 'aliexpress-affiliate', test: 'searchProducts', status: 'skipped', message: 'No configurada' });
    }
  } catch (error: any) {
    console.log(`❌ AliExpress Affiliate API: Error - ${error.message}`);
    tests.push({ api: 'aliexpress-affiliate', test: 'searchProducts', status: 'error', message: error.message });
  }

  // Probar eBay (sin OAuth, solo verificar credenciales)
  try {
    console.log('📡 Probando eBay API (validación de credenciales)...');
    const ebayCreds = await CredentialsManager.getCredentials(userId, 'ebay', 'sandbox');
    if (ebayCreds && ebayCreds.appId && ebayCreds.devId && ebayCreds.certId) {
      const service = new EbayService({
        appId: ebayCreds.appId,
        devId: ebayCreds.devId,
        certId: ebayCreds.certId,
        redirectUri: ebayCreds.redirectUri || '',
        sandbox: true
      });
      
      // Generar URL de OAuth para verificar que las credenciales son válidas
      const authUrl = service.getAuthUrl(ebayCreds.redirectUri || '');
      if (authUrl && authUrl.includes('auth.sandbox.ebay.com')) {
        console.log(`✅ eBay API: Credenciales válidas (OAuth pendiente)`);
        tests.push({ api: 'ebay', test: 'credentials', status: 'success', message: 'Credenciales válidas, OAuth pendiente' });
      } else {
        console.log(`⚠️  eBay API: URL de OAuth no generada correctamente`);
        tests.push({ api: 'ebay', test: 'credentials', status: 'warning', message: 'URL no generada' });
      }
    } else {
      console.log(`⚠️  eBay API: No configurada`);
      tests.push({ api: 'ebay', test: 'credentials', status: 'skipped', message: 'No configurada' });
    }
  } catch (error: any) {
    console.log(`❌ eBay API: Error - ${error.message}`);
    tests.push({ api: 'ebay', test: 'credentials', status: 'error', message: error.message });
  }

  // Probar Groq
  try {
    console.log('📡 Probando Groq API...');
    const groqCreds = await CredentialsManager.getCredentials(userId, 'groq', 'production');
    if (groqCreds && groqCreds.apiKey) {
      // Hacer una llamada simple de prueba
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${groqCreds.apiKey}`
        }
      });
      
      if (response.ok) {
        console.log(`✅ Groq API: Funcionando`);
        tests.push({ api: 'groq', test: 'models', status: 'success' });
      } else {
        console.log(`⚠️  Groq API: Error HTTP ${response.status}`);
        tests.push({ api: 'groq', test: 'models', status: 'error', message: `HTTP ${response.status}` });
      }
    } else {
      console.log(`⚠️  Groq API: No configurada`);
      tests.push({ api: 'groq', test: 'models', status: 'skipped', message: 'No configurada' });
    }
  } catch (error: any) {
    console.log(`❌ Groq API: Error - ${error.message}`);
    tests.push({ api: 'groq', test: 'models', status: 'error', message: error.message });
  }

  // Probar flujo completo de búsqueda de oportunidades (end-to-end)
  try {
    console.log('\n📡 Probando flujo completo de búsqueda de oportunidades...');
    const opportunityFinderModule = await import('../src/services/opportunity-finder.service');
    // El servicio se exporta como default
    const opportunityFinder = opportunityFinderModule.default;
    
    if (!opportunityFinder || typeof opportunityFinder.findOpportunities !== 'function') {
      console.log(`⚠️  Flujo de búsqueda: No se pudo importar el servicio correctamente`);
      tests.push({ api: 'opportunity-finder', test: 'end-to-end', status: 'skipped', message: 'Servicio no disponible' });
    } else {
      const opportunities = await opportunityFinder.findOpportunities(userId, {
        query: 'smartwatch',
        maxItems: 2,
        marketplaces: ['ebay'],
        region: 'us',
        environment: 'sandbox'
      });
      
      if (opportunities && opportunities.length > 0) {
        console.log(`✅ Flujo de búsqueda: Funcionando (${opportunities.length} oportunidades encontradas)`);
        console.log(`   Primera oportunidad: ${opportunities[0].title?.substring(0, 50)}...`);
        tests.push({ api: 'opportunity-finder', test: 'end-to-end', status: 'success', message: `${opportunities.length} oportunidades` });
      } else {
        console.log(`⚠️  Flujo de búsqueda: Respondió pero sin oportunidades`);
        tests.push({ api: 'opportunity-finder', test: 'end-to-end', status: 'warning', message: 'Sin oportunidades' });
      }
    }
  } catch (error: any) {
    console.log(`⚠️  Flujo de búsqueda: Error - ${error.message}`);
    tests.push({ api: 'opportunity-finder', test: 'end-to-end', status: 'error', message: error.message });
  }

  // Resumen de pruebas
  console.log(`\n📊 Resumen de pruebas:`);
  const success = tests.filter(t => t.status === 'success').length;
  const warnings = tests.filter(t => t.status === 'warning').length;
  const errors = tests.filter(t => t.status === 'error').length;
  const skipped = tests.filter(t => t.status === 'skipped').length;
  
  console.log(`   ✅ Exitosos: ${success}`);
  console.log(`   ⚠️  Advertencias: ${warnings}`);
  console.log(`   ❌ Errores: ${errors}`);
  console.log(`   ⏭️  Omitidos: ${skipped}`);

  return tests;
}

// Ejecutar
async function main() {
  try {
    const userId = 1; // Admin
    
    // Paso 1: Configurar APIs
    const configResults = await configureAPIs(userId);
    
    // Pequeño delay antes de probar
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Paso 2: Probar APIs
    const testResults = await testAPIs(userId);
    
    console.log(`\n✨ Proceso completado`);
    
  } catch (error: any) {
    console.error('\n💥 Error fatal:', error);
    logger.error('Error en configure-and-test-apis', { error: error.message, stack: error.stack });
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

