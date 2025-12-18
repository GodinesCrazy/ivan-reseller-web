/**
 * ? CERT-GO: Loader seguro para APIS.txt
 * 
 * Este script lee APIS.txt localmente y configura APIs en el backend desplegado
 * vía HTTP endpoint (POST /api/api-credentials).
 * 
 * SEGURIDAD:
 * - NUNCA imprime valores completos (solo keys detectadas y boolean "present")
 * - Enmascara valores al loguear (4 primeros + 4 últimos caracteres)
 * - APIS.txt debe estar en .gitignore (verificado)
 * 
 * Uso:
 *   cd backend
 *   npx tsx scripts/load-apis-from-txt.ts <BACKEND_URL> <USERNAME> <PASSWORD> [userId]
 * 
 * Ejemplo:
 *   npx tsx scripts/load-apis-from-txt.ts https://backend.railway.app admin admin123 1
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const APIS_FILE_PATH = path.join(process.cwd(), '../../APIS.txt');

interface APIConfig {
  apiName: string;
  environment: string;
  credentials: Record<string, any>;
}

/**
 * Enmascarar valor: muestra solo 4 primeros + 4 últimos caracteres
 */
function maskValue(value: string): string {
  if (!value || value.length <= 8) {
    return '***';
  }
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}

/**
 * Leer y parsear APIS.txt (parser robusto)
 */
function parseAPISFile(): Record<string, APIConfig> {
  console.log('?? Leyendo APIS.txt...');
  
  if (!fs.existsSync(APIS_FILE_PATH)) {
    throw new Error(`APIS.txt no encontrado en: ${APIS_FILE_PATH}`);
  }

  const content = fs.readFileSync(APIS_FILE_PATH, 'utf-8');
  const lines = content.split('\n');
  
  const apis: Record<string, APIConfig> = {};
  let currentAPI: string | null = null;
  let environment: string = 'production';
  let currentCredentials: Record<string, any> = {};

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Ignorar comentarios
    if (line.startsWith('#')) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('sandbox:')) {
        environment = 'sandbox';
      } else if (lowerLine.includes('live:') || lowerLine.includes('production:')) {
        environment = 'production';
      }
      continue;
    }
    
    if (!line) {
      // Línea vacía: finalizar API actual si hay una
      if (currentAPI && Object.keys(currentCredentials).length > 0) {
        const key = `${currentAPI}_${environment}`;
        apis[key] = {
          apiName: currentAPI,
          environment,
          credentials: { ...currentCredentials }
        };
        currentCredentials = {};
      }
      continue;
    }

    // Detectar inicio de sección de API
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('ebay')) {
      currentAPI = 'ebay';
      environment = lowerLine.includes('sandbox') ? 'sandbox' : 'production';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('amazon')) {
      currentAPI = 'amazon';
      environment = lowerLine.includes('sandbox') ? 'sandbox' : 'production';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('mercadolibre') || lowerLine.includes('ml')) {
      currentAPI = 'mercadolibre';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('paypal')) {
      currentAPI = 'paypal';
      environment = lowerLine.includes('sandbox') ? 'sandbox' : 'production';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('groq')) {
      currentAPI = 'groq';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('openai')) {
      currentAPI = 'openai';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('scraperapi') || lowerLine.includes('scraper-api')) {
      currentAPI = 'scraperapi';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('zenrows')) {
      currentAPI = 'zenrows';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('2captcha')) {
      currentAPI = '2captcha';
      currentCredentials = {};
      continue;
    } else if (lowerLine.includes('aliexpress')) {
      currentAPI = 'aliexpress';
      currentCredentials = {};
      continue;
    }

    // Parsear KEY=VALUE o KEY : VALUE
    if (currentAPI) {
      const colonMatch = line.match(/^([^:=]+)[:=]\s*(.+)$/);
      if (colonMatch) {
        const key = colonMatch[1].trim();
        let value = colonMatch[2].trim();
        
        // Si el valor está vacío o es solo espacios, puede estar en la siguiente línea
        if (!value && i < lines.length - 1) {
          const nextLine = lines[i + 1]?.trim();
          if (nextLine && !nextLine.includes(':') && !nextLine.includes('=')) {
            value = nextLine;
            i++; // Saltar la siguiente línea
          }
        }
        
        if (key && value) {
          currentCredentials[key] = value;
        }
      }
    }
  }

  // Agregar última API si hay una pendiente
  if (currentAPI && Object.keys(currentCredentials).length > 0) {
    const key = `${currentAPI}_${environment}`;
    apis[key] = {
      apiName: currentAPI,
      environment,
      credentials: { ...currentCredentials }
    };
  }

  return apis;
}

/**
 * Login y obtener JWT token
 */
async function login(backendUrl: string, username: string, password: string): Promise<string> {
  console.log(`?? Autenticando como ${username}...`);
  
  try {
    const response = await axios.post(`${backendUrl}/api/auth/login`, {
      username,
      password
    }, {
      timeout: 10000
    });

    if (response.data.token) {
      console.log('? Autenticación exitosa');
      return response.data.token;
    }
    
    throw new Error('Token no recibido en respuesta');
  } catch (error: any) {
    if (error.response) {
      throw new Error(`Error de autenticación: ${error.response.status} - ${error.response.data?.message || 'Unknown'}`);
    }
    throw new Error(`Error de conexión: ${error.message}`);
  }
}

/**
 * Configurar API vía HTTP endpoint
 */
async function configureAPI(
  backendUrl: string,
  token: string,
  config: APIConfig,
  userId?: number
): Promise<{ success: boolean; message: string }> {
  const { apiName, environment, credentials } = config;
  
  // ? SEGURIDAD: Solo mostrar keys, no valores
  const keys = Object.keys(credentials);
  console.log(`\n?? Configurando ${apiName} (${environment})...`);
  console.log(`   Keys detectadas: ${keys.join(', ')}`);
  console.log(`   Credentials present: ${keys.length > 0}`);
  
  try {
    const payload: any = {
      apiName,
      environment,
      credentials,
      isActive: true
    };
    
    if (userId) {
      payload.targetUserId = userId;
    }

    const response = await axios.post(
      `${backendUrl}/api/api-credentials`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data.success) {
      return {
        success: true,
        message: `${apiName} configurado exitosamente`
      };
    }
    
    return {
      success: false,
      message: response.data.error || 'Error desconocido'
    };
  } catch (error: any) {
    if (error.response) {
      const errorMsg = error.response.data?.error || error.response.data?.message || 'Unknown error';
      return {
        success: false,
        message: `HTTP ${error.response.status}: ${errorMsg}`
      };
    }
    return {
      success: false,
      message: `Error de conexión: ${error.message}`
    };
  }
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('? Uso: npx tsx scripts/load-apis-from-txt.ts <BACKEND_URL> <USERNAME> <PASSWORD> [userId]');
    console.error('   Ejemplo: npx tsx scripts/load-apis-from-txt.ts https://backend.railway.app admin admin123 1');
    process.exit(1);
  }

  const [backendUrl, username, password, userIdStr] = args;
  const userId = userIdStr ? parseInt(userIdStr, 10) : undefined;

  if (!backendUrl.startsWith('http')) {
    console.error('? BACKEND_URL debe ser una URL válida (http:// o https://)');
    process.exit(1);
  }

  try {
    // Parsear APIS.txt
    const apis = parseAPISFile();
    const apiKeys = Object.keys(apis);
    
    console.log(`\n? APIS.txt parseado: ${apiKeys.length} configuración(es) encontrada(s)`);
    console.log(`   APIs: ${apiKeys.map(k => k.split('_')[0]).join(', ')}`);
    
    // Login
    const token = await login(backendUrl, username, password);
    
    // Configurar cada API
    const results: Array<{ api: string; success: boolean; message: string }> = [];
    
    for (const [key, config] of Object.entries(apis)) {
      const result = await configureAPI(backendUrl, token, config, userId);
      results.push({
        api: key,
        success: result.success,
        message: result.message
      });
      
      if (result.success) {
        console.log(`   ? ${key}: ${result.message}`);
      } else {
        console.log(`   ? ${key}: ${result.message}`);
      }
      
      // Peque?o delay entre requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Resumen
    console.log('\n?? Resumen:');
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`   ? Exitosas: ${successCount}`);
    console.log(`   ? Fallidas: ${failCount}`);
    
    if (failCount > 0) {
      console.log('\n??  APIs con errores:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.api}: ${r.message}`);
      });
    }
    
    process.exit(failCount > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('\n? Error:', error.message);
    if (error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
