/**
 * Script para probar todas las APIs configuradas
 * 
 * Este script:
 * 1. Obtiene todas las credenciales configuradas desde la BD
 * 2. Hace llamadas mínimas seguras a cada API
 * 3. Reporta OK/ERROR sin mostrar claves
 * 
 * Uso:
 *   npm run test-apis
 *   o
 *   tsx scripts/test-apis.ts
 */

import { CredentialsManager } from '../src/services/credentials-manager.service';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../src/config/logger';

const prisma = new PrismaClient();

interface TestResult {
  api: string;
  environment: string;
  status: 'OK' | 'ERROR' | 'SKIP';
  message: string;
  latency?: number;
}

/**
 * Test Groq API
 */
async function testGroq(apiKey: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now();
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    const latency = Date.now() - startTime;
    return { success: response.status === 200, message: 'API respondió correctamente', latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    if (error.response?.status === 401) {
      return { success: false, message: 'API Key inválida', latency };
    } else if (error.response?.status === 429) {
      return { success: false, message: 'Rate limit excedido', latency };
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return { success: false, message: 'Error de conexión', latency };
    }
    return { success: false, message: error.response?.data?.error?.message || error.message || 'Error desconocido', latency };
  }
}

/**
 * Test eBay API (health check)
 */
async function testEbay(credentials: any, environment: 'sandbox' | 'production'): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now();
  try {
    // eBay no tiene un endpoint simple de health check sin OAuth
    // Verificamos que las credenciales base estén presentes
    if (!credentials.appId || !credentials.devId || !credentials.certId) {
      return { success: false, message: 'Faltan credenciales base (App ID, Dev ID, Cert ID)' };
    }
    
    // Si hay token, intentamos un health check básico
    if (credentials.token) {
      const baseUrl = environment === 'sandbox' 
        ? 'https://api.sandbox.ebay.com'
        : 'https://api.ebay.com';
      
      try {
        const response = await axios.get(`${baseUrl}/sell/account/v1/privilege`, {
          headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });
        const latency = Date.now() - startTime;
        return { success: response.status === 200, message: 'Token OAuth válido', latency };
      } catch (error: any) {
        const latency = Date.now() - startTime;
        if (error.response?.status === 401) {
          return { success: false, message: 'Token OAuth expirado o inválido', latency };
        }
        return { success: false, message: 'Credenciales base OK, pero token OAuth requiere renovación', latency };
      }
    }
    
    const latency = Date.now() - startTime;
    return { success: true, message: 'Credenciales base configuradas (requiere OAuth para uso completo)', latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    return { success: false, message: error.message || 'Error desconocido', latency };
  }
}

/**
 * Test ScraperAPI
 */
async function testScraperAPI(apiKey: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now();
  try {
    const response = await axios.get(
      `http://api.scraperapi.com?api_key=${apiKey}&url=https://httpbin.org/ip`,
      { timeout: 15000 }
    );
    const latency = Date.now() - startTime;
    return { success: response.status === 200, message: 'API respondió correctamente', latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    if (error.response?.status === 403 || error.response?.status === 401) {
      return { success: false, message: 'API Key inválida', latency };
    }
    return { success: false, message: error.message || 'Error desconocido', latency };
  }
}

/**
 * Test ZenRows API
 */
async function testZenRows(apiKey: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now();
  try {
    const response = await axios.get(
      `https://api.zenrows.com/v1/?apikey=${apiKey}&url=https://httpbin.org/ip`,
      { timeout: 15000 }
    );
    const latency = Date.now() - startTime;
    return { success: response.status === 200, message: 'API respondió correctamente', latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    if (error.response?.status === 403 || error.response?.status === 401) {
      return { success: false, message: 'API Key inválida', latency };
    }
    return { success: false, message: error.message || 'Error desconocido', latency };
  }
}

/**
 * Test PayPal API
 */
async function testPayPal(credentials: any, environment: 'sandbox' | 'production'): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now();
  try {
    if (!credentials.clientId || !credentials.clientSecret) {
      return { success: false, message: 'Faltan credenciales (Client ID, Client Secret)' };
    }
    
    const baseUrl = environment === 'sandbox'
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';
    
    const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
    
    const response = await axios.post(
      `${baseUrl}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );
    const latency = Date.now() - startTime;
    return { success: response.status === 200 && response.data.access_token, message: 'Credenciales válidas', latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    if (error.response?.status === 401) {
      return { success: false, message: 'Credenciales inválidas', latency };
    }
    return { success: false, message: error.message || 'Error desconocido', latency };
  }
}

/**
 * Test Stripe API
 */
async function testStripe(credentials: any, environment: 'sandbox' | 'production'): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now();
  try {
    if (!credentials.secretKey) {
      return { success: false, message: 'Falta Secret Key' };
    }
    
    const response = await axios.get('https://api.stripe.com/v1/balance', {
      headers: {
        'Authorization': `Bearer ${credentials.secretKey}`,
      },
      timeout: 10000,
    });
    const latency = Date.now() - startTime;
    return { success: response.status === 200, message: 'API Key válida', latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    if (error.response?.status === 401) {
      return { success: false, message: 'API Key inválida', latency };
    }
    return { success: false, message: error.message || 'Error desconocido', latency };
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🧪 Probando APIs configuradas...\n');
  
  const results: TestResult[] = [];
  
  try {
    // Obtener usuario admin
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { id: 'asc' }
    });
    
    if (!admin) {
      throw new Error('No se encontró usuario administrador');
    }
    
    console.log(`👤 Usuario admin: ${admin.username} (ID: ${admin.id})\n`);
    
    // Test Groq
    console.log('🔍 Probando Groq...');
    const groqCreds = await CredentialsManager.getCredentials(admin.id, 'groq', 'production');
    if (groqCreds?.apiKey) {
      const result = await testGroq(groqCreds.apiKey);
      results.push({
        api: 'groq',
        environment: 'production',
        status: result.success ? 'OK' : 'ERROR',
        message: result.message,
        latency: result.latency,
      });
    } else {
      results.push({ api: 'groq', environment: 'production', status: 'SKIP', message: 'No configurado' });
    }
    
    // Test eBay Sandbox
    console.log('🔍 Probando eBay (Sandbox)...');
    const ebaySandboxCreds = await CredentialsManager.getCredentials(admin.id, 'ebay', 'sandbox');
    if (ebaySandboxCreds) {
      const result = await testEbay(ebaySandboxCreds, 'sandbox');
      results.push({
        api: 'ebay',
        environment: 'sandbox',
        status: result.success ? 'OK' : 'ERROR',
        message: result.message,
        latency: result.latency,
      });
    } else {
      results.push({ api: 'ebay', environment: 'sandbox', status: 'SKIP', message: 'No configurado' });
    }
    
    // Test eBay Production
    console.log('🔍 Probando eBay (Production)...');
    const ebayProdCreds = await CredentialsManager.getCredentials(admin.id, 'ebay', 'production');
    if (ebayProdCreds) {
      const result = await testEbay(ebayProdCreds, 'production');
      results.push({
        api: 'ebay',
        environment: 'production',
        status: result.success ? 'OK' : 'ERROR',
        message: result.message,
        latency: result.latency,
      });
    } else {
      results.push({ api: 'ebay', environment: 'production', status: 'SKIP', message: 'No configurado' });
    }
    
    // Test ScraperAPI
    console.log('🔍 Probando ScraperAPI...');
    const scraperapiCreds = await CredentialsManager.getCredentials(admin.id, 'scraperapi', 'production');
    if (scraperapiCreds?.apiKey) {
      const result = await testScraperAPI(scraperapiCreds.apiKey);
      results.push({
        api: 'scraperapi',
        environment: 'production',
        status: result.success ? 'OK' : 'ERROR',
        message: result.message,
        latency: result.latency,
      });
    } else {
      results.push({ api: 'scraperapi', environment: 'production', status: 'SKIP', message: 'No configurado' });
    }
    
    // Test ZenRows
    console.log('🔍 Probando ZenRows...');
    const zenrowsCreds = await CredentialsManager.getCredentials(admin.id, 'zenrows', 'production');
    if (zenrowsCreds?.apiKey) {
      const result = await testZenRows(zenrowsCreds.apiKey);
      results.push({
        api: 'zenrows',
        environment: 'production',
        status: result.success ? 'OK' : 'ERROR',
        message: result.message,
        latency: result.latency,
      });
    } else {
      results.push({ api: 'zenrows', environment: 'production', status: 'SKIP', message: 'No configurado' });
    }
    
    // Test PayPal
    console.log('🔍 Probando PayPal (Sandbox)...');
    const paypalCreds = await CredentialsManager.getCredentials(admin.id, 'paypal', 'sandbox');
    if (paypalCreds) {
      const result = await testPayPal(paypalCreds, 'sandbox');
      results.push({
        api: 'paypal',
        environment: 'sandbox',
        status: result.success ? 'OK' : 'ERROR',
        message: result.message,
        latency: result.latency,
      });
    } else {
      results.push({ api: 'paypal', environment: 'sandbox', status: 'SKIP', message: 'No configurado' });
    }
    
    // Test Stripe
    console.log('🔍 Probando Stripe (Sandbox)...');
    const stripeCreds = await CredentialsManager.getCredentials(admin.id, 'stripe', 'sandbox');
    if (stripeCreds) {
      const result = await testStripe(stripeCreds, 'sandbox');
      results.push({
        api: 'stripe',
        environment: 'sandbox',
        status: result.success ? 'OK' : 'ERROR',
        message: result.message,
        latency: result.latency,
      });
    } else {
      results.push({ api: 'stripe', environment: 'sandbox', status: 'SKIP', message: 'No configurado' });
    }
    
    // Mostrar resultados
    console.log('\n📊 RESULTADOS DE PRUEBAS:\n');
    console.log('─'.repeat(80));
    results.forEach(result => {
      const icon = result.status === 'OK' ? '✅' : result.status === 'ERROR' ? '❌' : '⏭️';
      const latencyText = result.latency ? ` (${result.latency}ms)` : '';
      console.log(`${icon} ${result.api} (${result.environment}): ${result.status} - ${result.message}${latencyText}`);
    });
    console.log('─'.repeat(80));
    
    const okCount = results.filter(r => r.status === 'OK').length;
    const errorCount = results.filter(r => r.status === 'ERROR').length;
    const skipCount = results.filter(r => r.status === 'SKIP').length;
    
    console.log(`\n✅ OK: ${okCount}`);
    if (errorCount > 0) {
      console.log(`❌ ERROR: ${errorCount}`);
    }
    if (skipCount > 0) {
      console.log(`⏭️  SKIP: ${skipCount}`);
    }
    
    console.log('\n✅ Pruebas completadas');
    
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

export { testGroq, testEbay, testScraperAPI, testZenRows, testPayPal, testStripe };

