/**
 * Script para configurar todas las APIs desde APIS.txt
 * 
 * Este script:
 * 1. Lee el archivo APIS.txt de la raíz del proyecto
 * 2. Parsea las credenciales según el formato del archivo
 * 3. Configura las credenciales en la BD (encriptadas) para el usuario admin
 * 4. Opcionalmente actualiza .env para desarrollo local
 * 
 * Uso:
 *   npm run configure-apis
 *   o
 *   tsx scripts/configure-apis-from-file.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { PrismaClient } from '@prisma/client';
import logger from '../src/config/logger';

const prisma = new PrismaClient();

// Mapeo de claves en APIS.txt a estructura esperada
interface ParsedAPIs {
  groq?: { apiKey: string };
  ebaySandbox?: { appId: string; devId: string; certId: string; redirectUri: string };
  ebayProduction?: { appId: string; devId: string; certId: string };
  openai?: { apiKey: string };
  gemini?: { apiKey: string };
  scraperapi?: { apiKey: string };
  zenrows?: { apiKey: string };
  brightdata?: { apiKey: string };
  paypal?: { clientId: string; clientSecret: string };
  sendgrid?: { apiKey: string };
  stripeSandbox?: { publicKey: string; secretKey: string; webhookSecret?: string };
  exchange?: { apiKey: string };
}

/**
 * Parsear archivo APIS.txt
 */
function parseAPIsFile(filePath: string): ParsedAPIs {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const parsed: ParsedAPIs = {};
  let currentSection = '';
  let ebaySection: 'sandbox' | 'production' | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }
    
    // Detect sections
    if (line.toLowerCase().includes('groq')) {
      const match = line.match(/groq\s*:\s*(.+)/i);
      if (match) {
        parsed.groq = { apiKey: match[1].trim() };
      }
      continue;
    }
    
    if (line.toLowerCase().includes('ebay') && line.toLowerCase().includes('sandbox')) {
      ebaySection = 'sandbox';
      parsed.ebaySandbox = {} as any;
      continue;
    }
    
    if (line.toLowerCase().includes('ebay') && (line.toLowerCase().includes('producción') || line.toLowerCase().includes('produccion') || line.toLowerCase().includes('production'))) {
      ebaySection = 'production';
      parsed.ebayProduction = {} as any;
      continue;
    }
    
    // Parse eBay fields - formato exacto del archivo
    if (ebaySection === 'sandbox' && parsed.ebaySandbox) {
      // Formato: "App ID (Client ID) <AppID>"
      if (line.toLowerCase().includes('app id')) {
        // Extraer el valor después de "App ID (Client ID) "
        const parts = line.split(/\s+/);
        const valueIndex = parts.findIndex((p, idx) => 
          idx > 0 && parts[idx - 1].toLowerCase().includes('id') && 
          (p.includes('SBX-') || p.includes('PRD-') || /^[A-Za-z0-9\-_]+$/.test(p))
        );
        if (valueIndex >= 0) {
          parsed.ebaySandbox.appId = parts[valueIndex].trim();
        } else {
          // Fallback: buscar cualquier valor que parezca App ID
          const match = line.match(/([A-Za-z0-9\-_]+-[A-Za-z0-9\-_]+)/);
          if (match) {
            parsed.ebaySandbox.appId = match[1].trim();
          }
        }
      } 
      // Formato: "Dev ID <DevID>"
      else if (line.toLowerCase().includes('dev id')) {
        const parts = line.split(/\s+/);
        const devIdIndex = parts.findIndex(p => p.toLowerCase() === 'id');
        if (devIdIndex >= 0 && parts[devIdIndex + 1]) {
          parsed.ebaySandbox.devId = parts[devIdIndex + 1].trim();
        }
      } 
      // Formato: "Cert ID (Client Secret) <CertID>"
      else if (line.toLowerCase().includes('cert id')) {
        const parts = line.split(/\s+/);
        // Buscar valor que empiece con SBX- o PRD-
        const certId = parts.find(p => p.startsWith('SBX-') || p.startsWith('PRD-'));
        if (certId) {
          parsed.ebaySandbox.certId = certId.trim();
        }
      } 
      // Formato: "Redirect URI (RuName) <RuName>"
      else if (line.toLowerCase().includes('redirect uri') || line.toLowerCase().includes('runame')) {
        const parts = line.split(/\s+/);
        // Buscar valor que parezca RuName (contiene guiones bajos y guiones)
        const runame = parts.find(p => p.includes('Ivan_') || (p.includes('_') && p.includes('-')));
        if (runame) {
          parsed.ebaySandbox.redirectUri = runame.trim();
        }
      }
    }
    
    if (ebaySection === 'production' && parsed.ebayProduction) {
      // Formato: "App ID (Client ID) IvanMart-IVANRese-PRD-febbdcd65-626be473"
      if (line.toLowerCase().includes('app id')) {
        const parts = line.split(/\s+/);
        const valueIndex = parts.findIndex((p, idx) => 
          idx > 0 && parts[idx - 1].toLowerCase().includes('id') && 
          (p.includes('IvanMart') || p.includes('PRD-'))
        );
        if (valueIndex >= 0) {
          parsed.ebayProduction.appId = parts[valueIndex].trim();
        } else {
          const match = line.match(/(IvanMart-[A-Za-z0-9\-_]+)/);
          if (match) {
            parsed.ebayProduction.appId = match[1].trim();
          }
        }
      } 
      else if (line.toLowerCase().includes('dev id')) {
        const parts = line.split(/\s+/);
        const devIdIndex = parts.findIndex(p => p.toLowerCase() === 'id');
        if (devIdIndex >= 0 && parts[devIdIndex + 1]) {
          parsed.ebayProduction.devId = parts[devIdIndex + 1].trim();
        }
      } 
      else if (line.toLowerCase().includes('cert id')) {
        const parts = line.split(/\s+/);
        const certId = parts.find(p => p.startsWith('SBX-') || p.startsWith('PRD-'));
        if (certId) {
          parsed.ebayProduction.certId = certId.trim();
        }
      }
    }
    
    // Parse other APIs
    // OpenAI: línea completa es la key
    if (line.toLowerCase().includes('openai') && line.includes('sk-')) {
      const match = line.match(/(sk-[A-Za-z0-9\-_]+)/);
      if (match) {
        parsed.openai = { apiKey: match[1].trim() };
      }
    }
    
    // Gemini: usar GEMINI_API_KEY (segunda ocurrencia)
    if (line.includes('GEMINI_API_KEY')) {
      const match = line.match(/GEMINI_API_KEY\s+(AIzaSy[A-Za-z0-9\-_]+)/i);
      if (match) {
        parsed.gemini = { apiKey: match[1].trim() };
      }
    }
    
    // ScraperAPI: "ScraperAPI Key : dcf6700..."
    if (line.toLowerCase().includes('scraperapi')) {
      const match = line.match(/scraperapi.*?key.*?:\s*([A-Za-z0-9]+)/i);
      if (match) {
        parsed.scraperapi = { apiKey: match[1].trim() };
      }
    }
    
    // ZenRows: "ZenRows API: 4aec1ce..."
    if (line.toLowerCase().includes('zenrows')) {
      const match = line.match(/zenrows.*?api.*?:\s*([A-Za-z0-9]+)/i);
      if (match) {
        parsed.zenrows = { apiKey: match[1].trim() };
      }
    }
    
    // BrightData: "brightdata: b00c69f..."
    if (line.toLowerCase().includes('brightdata')) {
      const match = line.match(/brightdata:\s*([A-Za-z0-9]+)/i);
      if (match) {
        parsed.brightdata = { apiKey: match[1].trim() };
      }
    }
    
    // PayPal: detectar sección
    if (line.toLowerCase().includes('paypal') && !line.includes('client') && !line.includes('secret')) {
      currentSection = 'paypal';
      parsed.paypal = {} as any;
      continue;
    }
    
    // PayPal: "client ID AYH1Okx..." (sin dos puntos)
    if (currentSection === 'paypal' && parsed.paypal) {
      if (line.toLowerCase().includes('client id')) {
        const parts = line.split(/\s+/);
        const clientIdIndex = parts.findIndex(p => p.toLowerCase() === 'id');
        if (clientIdIndex >= 0 && parts[clientIdIndex + 1]) {
          parsed.paypal.clientId = parts[clientIdIndex + 1].trim();
        }
      } 
      // PayPal: "secret Key  EKjZYTF..." (con espacios)
      else if (line.toLowerCase().includes('secret') && line.toLowerCase().includes('key')) {
        const parts = line.split(/\s+/);
        const secretIndex = parts.findIndex(p => p.toLowerCase() === 'key');
        if (secretIndex >= 0 && parts[secretIndex + 1]) {
          parsed.paypal.clientSecret = parts[secretIndex + 1].trim();
        }
      }
    }
    
    // SendGrid/Twilio: "SENDGRID_API_KEY SWD2C5P..."
    if (line.includes('SENDGRID_API_KEY')) {
      const match = line.match(/SENDGRID_API_KEY\s+([A-Za-z0-9]+)/i);
      if (match) {
        parsed.sendgrid = { apiKey: match[1].trim() };
      }
    }
    
    // Stripe: STRIPE_SECRET_KEY tiene pk_test_ (es public key, no secret) - nombre incorrecto en APIS.txt
    if (line.includes('STRIPE_SECRET_KEY')) {
      const match = line.match(/STRIPE_SECRET_KEY\s+(pk_test_[A-Za-z0-9\-_]+)/i);
      if (match) {
        if (!parsed.stripeSandbox) {
          parsed.stripeSandbox = {} as any;
        }
        parsed.stripeSandbox.publicKey = match[1].trim();
      }
    }
    
    // Stripe: STRIPE_WEBHOOK_SECRET tiene sk_test_ (es secret key)
    if (line.includes('STRIPE_WEBHOOK_SECRET')) {
      const match = line.match(/STRIPE_WEBHOOK_SECRET\s+(sk_test_[A-Za-z0-9\-_]+)/i);
      if (match) {
        if (!parsed.stripeSandbox) {
          parsed.stripeSandbox = {} as any;
        }
        parsed.stripeSandbox.secretKey = match[1].trim();
        parsed.stripeSandbox.webhookSecret = match[1].trim();
      }
    }
    
    // Exchange API: "Exchange API Key 0895d456..."
    if (line.toLowerCase().includes('exchange')) {
      const match = line.match(/Exchange API Key\s+([A-Za-z0-9]+)/i);
      if (match) {
        parsed.exchange = { apiKey: match[1].trim() };
      }
    }
  }
  
  return parsed;
}

/**
 * Configurar credenciales en la BD
 */
async function configureCredentials(parsed: ParsedAPIs, adminUserId: number) {
  const results: Array<{ api: string; environment: string; status: 'OK' | 'ERROR'; message: string }> = [];
  
  try {
    // ✅ Limpiar credenciales existentes corruptas antes de guardar nuevas
    console.log('🧹 Limpiando credenciales existentes...');
    const apisToClean = [
      { api: 'groq', env: 'production' },
      { api: 'ebay', env: 'sandbox' },
      { api: 'ebay', env: 'production' },
      { api: 'scraperapi', env: 'production' },
      { api: 'zenrows', env: 'production' },
      { api: 'paypal', env: 'sandbox' },
      { api: 'stripe', env: 'sandbox' },
    ];
    
    for (const { api, env } of apisToClean) {
      try {
        await CredentialsManager.deleteCredentials(adminUserId, api as any, env as any, 'global');
        await CredentialsManager.deleteCredentials(adminUserId, api as any, env as any, 'user');
      } catch (error: any) {
        // Ignorar errores si no existen
        if (!error.message?.includes('not found')) {
          logger.warn(`Error limpiando ${api} ${env}:`, error.message);
        }
      }
    }
    console.log('✅ Credenciales limpiadas\n');
    // Groq
    if (parsed.groq?.apiKey) {
      try {
        await CredentialsManager.saveCredentials(
          adminUserId,
          'groq',
          { apiKey: parsed.groq.apiKey },
          'production',
          { scope: 'global' }
        );
        results.push({ api: 'groq', environment: 'production', status: 'OK', message: 'Configurado correctamente' });
      } catch (error: any) {
        results.push({ api: 'groq', environment: 'production', status: 'ERROR', message: error.message });
      }
    }
    
    // eBay Sandbox
    if (parsed.ebaySandbox?.appId && parsed.ebaySandbox?.devId && parsed.ebaySandbox?.certId) {
      try {
        await CredentialsManager.saveCredentials(
          adminUserId,
          'ebay',
          {
            appId: parsed.ebaySandbox.appId,
            devId: parsed.ebaySandbox.devId,
            certId: parsed.ebaySandbox.certId,
            redirectUri: parsed.ebaySandbox.redirectUri || '',
            sandbox: true,
          },
          'sandbox',
          { scope: 'global' }
        );
        results.push({ api: 'ebay', environment: 'sandbox', status: 'OK', message: 'Configurado correctamente' });
      } catch (error: any) {
        results.push({ api: 'ebay', environment: 'sandbox', status: 'ERROR', message: error.message });
      }
    }
    
    // eBay Production
    if (parsed.ebayProduction?.appId && parsed.ebayProduction?.devId && parsed.ebayProduction?.certId) {
      try {
        await CredentialsManager.saveCredentials(
          adminUserId,
          'ebay',
          {
            appId: parsed.ebayProduction.appId,
            devId: parsed.ebayProduction.devId,
            certId: parsed.ebayProduction.certId,
            sandbox: false,
          },
          'production',
          { scope: 'global' }
        );
        results.push({ api: 'ebay', environment: 'production', status: 'OK', message: 'Configurado correctamente' });
      } catch (error: any) {
        results.push({ api: 'ebay', environment: 'production', status: 'ERROR', message: error.message });
      }
    }
    
    // OpenAI
    if (parsed.openai?.apiKey) {
      try {
        await CredentialsManager.saveCredentials(
          adminUserId,
          'openai',
          { apiKey: parsed.openai.apiKey },
          'production',
          { scope: 'global' }
        );
        results.push({ api: 'openai', environment: 'production', status: 'OK', message: 'Configurado correctamente' });
      } catch (error: any) {
        results.push({ api: 'openai', environment: 'production', status: 'ERROR', message: error.message });
      }
    }
    
    // ScraperAPI
    if (parsed.scraperapi?.apiKey) {
      try {
        await CredentialsManager.saveCredentials(
          adminUserId,
          'scraperapi',
          { apiKey: parsed.scraperapi.apiKey },
          'production',
          { scope: 'global' }
        );
        results.push({ api: 'scraperapi', environment: 'production', status: 'OK', message: 'Configurado correctamente' });
      } catch (error: any) {
        results.push({ api: 'scraperapi', environment: 'production', status: 'ERROR', message: error.message });
      }
    }
    
    // ZenRows
    if (parsed.zenrows?.apiKey) {
      try {
        await CredentialsManager.saveCredentials(
          adminUserId,
          'zenrows',
          { apiKey: parsed.zenrows.apiKey },
          'production',
          { scope: 'global' }
        );
        results.push({ api: 'zenrows', environment: 'production', status: 'OK', message: 'Configurado correctamente' });
      } catch (error: any) {
        results.push({ api: 'zenrows', environment: 'production', status: 'ERROR', message: error.message });
      }
    }
    
    // PayPal (sandbox por defecto)
    if (parsed.paypal?.clientId && parsed.paypal?.clientSecret) {
      try {
        await CredentialsManager.saveCredentials(
          adminUserId,
          'paypal',
          {
            clientId: parsed.paypal.clientId,
            clientSecret: parsed.paypal.clientSecret,
            environment: 'sandbox',
          },
          'sandbox',
          { scope: 'global' }
        );
        results.push({ api: 'paypal', environment: 'sandbox', status: 'OK', message: 'Configurado correctamente (sandbox)' });
      } catch (error: any) {
        results.push({ api: 'paypal', environment: 'sandbox', status: 'ERROR', message: error.message });
      }
    }
    
    // Stripe Sandbox
    if (parsed.stripeSandbox?.publicKey && parsed.stripeSandbox?.secretKey) {
      try {
        await CredentialsManager.saveCredentials(
          adminUserId,
          'stripe',
          {
            publicKey: parsed.stripeSandbox.publicKey,
            secretKey: parsed.stripeSandbox.secretKey,
            webhookSecret: parsed.stripeSandbox.webhookSecret || '',
            sandbox: true,
          },
          'sandbox',
          { scope: 'global' }
        );
        results.push({ api: 'stripe', environment: 'sandbox', status: 'OK', message: 'Configurado correctamente' });
      } catch (error: any) {
        results.push({ api: 'stripe', environment: 'sandbox', status: 'ERROR', message: error.message });
      }
    }
    
  } catch (error: any) {
    logger.error('Error configuring credentials', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
  
  return results;
}

/**
 * Función principal
 */
async function main() {
  console.log('🔧 Configurando APIs desde APIS.txt...\n');
  
  try {
    // 1. Encontrar archivo APIS.txt
    const rootDir = path.resolve(__dirname, '../..');
    const apisFile = path.join(rootDir, 'APIS.txt');
    
    if (!fs.existsSync(apisFile)) {
      throw new Error(`Archivo APIS.txt no encontrado en: ${apisFile}`);
    }
    
    console.log(`✅ Archivo encontrado: ${apisFile}\n`);
    
    // 2. Parsear archivo
    console.log('📖 Parseando archivo APIS.txt...');
    const parsed = parseAPIsFile(apisFile);
    console.log('✅ Archivo parseado correctamente\n');
    
    // 3. Obtener usuario admin
    console.log('👤 Buscando usuario administrador...');
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { id: 'asc' }
    });
    
    if (!admin) {
      throw new Error('No se encontró usuario administrador. Ejecuta el seed primero.');
    }
    
    console.log(`✅ Usuario admin encontrado: ${admin.username} (ID: ${admin.id})\n`);
    
    // 4. Configurar credenciales
    console.log('💾 Configurando credenciales en la base de datos...\n');
    const results = await configureCredentials(parsed, admin.id);
    
    // 5. Mostrar resultados
    console.log('📊 RESULTADOS DE CONFIGURACIÓN:\n');
    console.log('─'.repeat(80));
    results.forEach(result => {
      const icon = result.status === 'OK' ? '✅' : '❌';
      console.log(`${icon} ${result.api} (${result.environment}): ${result.status} - ${result.message}`);
    });
    console.log('─'.repeat(80));
    
    const successCount = results.filter(r => r.status === 'OK').length;
    const errorCount = results.filter(r => r.status === 'ERROR').length;
    
    console.log(`\n✅ Configuradas correctamente: ${successCount}`);
    if (errorCount > 0) {
      console.log(`❌ Errores: ${errorCount}`);
    }
    
    console.log('\n✅ Configuración completada');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
if (require.main === module) {
  main().catch(console.error);
}

export { parseAPIsFile, configureCredentials };

