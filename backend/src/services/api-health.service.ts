/**
 * Servicio para probar la salud de todas las APIs configuradas
 * 
 * Este servicio reutiliza la lógica de test-apis.ts pero como servicio
 * reutilizable que puede ser llamado desde endpoints HTTP.
 */

import { trace } from '../utils/boot-trace';
trace('loading api-health.service');

import { CredentialsManager } from './credentials-manager.service';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../config/logger';

const prisma = new PrismaClient();

export type ApiTestStatus = 'OK' | 'ERROR' | 'SKIP';

export interface ApiTestResult {
  name: string;
  provider: string;
  environment: 'sandbox' | 'production' | 'other';
  status: ApiTestStatus;
  latencyMs?: number;
  message: string;
  suggestion?: string;
}

export interface ApiTestSummary {
  ok: number;
  error: number;
  skip: number;
  total: number;
  results: ApiTestResult[];
}

/**
 * Generar sugerencia basada en el error
 */
function generateSuggestion(api: string, status: ApiTestStatus, message: string): string | undefined {
  if (status === 'OK') return undefined;
  
  const lowerMessage = message.toLowerCase();
  
  // Groq
  if (api === 'groq') {
    if (lowerMessage.includes('invalid') || lowerMessage.includes('inválida')) {
      return 'Verifica tu API Key en https://console.groq.com/keys y asegúrate de que esté activa';
    }
    if (lowerMessage.includes('rate limit')) {
      return 'Has excedido el límite de requests. Espera unos minutos o actualiza tu plan';
    }
  }
  
  // eBay
  if (api === 'ebay') {
    if (lowerMessage.includes('oauth') || lowerMessage.includes('token')) {
      return 'Completa el flujo OAuth en Settings → API Settings → eBay. Presiona el botón "OAuth" y autoriza la aplicación';
    }
    if (lowerMessage.includes('faltan credenciales')) {
      return 'Configura App ID, Dev ID y Cert ID en Settings → API Settings → eBay';
    }
  }
  
  // ScraperAPI
  if (api === 'scraperapi') {
    if (lowerMessage.includes('timeout')) {
      return 'La API está lenta o hay problemas de conectividad. Verifica tu conexión a internet';
    }
    if (lowerMessage.includes('invalid') || lowerMessage.includes('inválida')) {
      return 'Verifica tu API Key en https://www.scraperapi.com/dashboard y asegúrate de tener créditos disponibles';
    }
  }
  
  // ZenRows
  if (api === 'zenrows') {
    if (lowerMessage.includes('402') || lowerMessage.includes('payment')) {
      return 'Tu cuenta no tiene créditos disponibles. Recarga créditos en https://www.zenrows.com/';
    }
    if (lowerMessage.includes('invalid') || lowerMessage.includes('inválida')) {
      return 'Verifica tu API Key en https://www.zenrows.com/dashboard';
    }
  }
  
  // PayPal
  if (api === 'paypal') {
    if (lowerMessage.includes('invalid') || lowerMessage.includes('inválida')) {
      return 'Verifica tus credenciales en https://developer.paypal.com/. Asegúrate de usar credenciales de sandbox si estás en modo sandbox';
    }
  }
  
  // Stripe
  if (api === 'stripe') {
    if (lowerMessage.includes('invalid') || lowerMessage.includes('inválida')) {
      return 'Verifica tu API Key en https://dashboard.stripe.com/apikeys. Asegúrate de usar claves de test (pk_test/sk_test) para sandbox';
    }
  }
  
  return 'Revisa la documentación de la API o contacta al soporte del proveedor';
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
    if (!credentials.appId || !credentials.devId || !credentials.certId) {
      return { success: false, message: 'Faltan credenciales base (App ID, Dev ID, Cert ID)' };
    }
    
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
    if (error.response?.status === 402) {
      return { success: false, message: 'Cuenta sin créditos disponibles', latency };
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
 * Ejecutar todos los tests de APIs
 */
export async function runAllApiTests(userId: number): Promise<ApiTestSummary> {
  const results: ApiTestResult[] = [];
  
  try {
    // Test Groq
    const groqCreds = await CredentialsManager.getCredentials(userId, 'groq', 'production');
    if (groqCreds?.apiKey) {
      const result = await testGroq(groqCreds.apiKey);
      const status: ApiTestStatus = result.success ? 'OK' : 'ERROR';
      results.push({
        name: 'Groq',
        provider: 'groq',
        environment: 'other',
        status,
        message: result.message,
        latencyMs: result.latency,
        suggestion: generateSuggestion('groq', status, result.message),
      });
    } else {
      results.push({
        name: 'Groq',
        provider: 'groq',
        environment: 'other',
        status: 'SKIP',
        message: 'No configurado',
        suggestion: 'Configura tu API Key de Groq en Settings → API Settings → Groq',
      });
    }
    
    // Test eBay Sandbox
    const ebaySandboxCreds = await CredentialsManager.getCredentials(userId, 'ebay', 'sandbox');
    if (ebaySandboxCreds) {
      const result = await testEbay(ebaySandboxCreds, 'sandbox');
      const status: ApiTestStatus = result.success ? 'OK' : 'ERROR';
      results.push({
        name: 'eBay (Sandbox)',
        provider: 'ebay',
        environment: 'sandbox',
        status,
        message: result.message,
        latencyMs: result.latency,
        suggestion: generateSuggestion('ebay', status, result.message),
      });
    } else {
      results.push({
        name: 'eBay (Sandbox)',
        provider: 'ebay',
        environment: 'sandbox',
        status: 'SKIP',
        message: 'No configurado',
        suggestion: 'Configura tus credenciales de eBay Sandbox en Settings → API Settings → eBay',
      });
    }
    
    // Test eBay Production
    const ebayProdCreds = await CredentialsManager.getCredentials(userId, 'ebay', 'production');
    if (ebayProdCreds) {
      const result = await testEbay(ebayProdCreds, 'production');
      const status: ApiTestStatus = result.success ? 'OK' : 'ERROR';
      results.push({
        name: 'eBay (Production)',
        provider: 'ebay',
        environment: 'production',
        status,
        message: result.message,
        latencyMs: result.latency,
        suggestion: generateSuggestion('ebay', status, result.message),
      });
    } else {
      results.push({
        name: 'eBay (Production)',
        provider: 'ebay',
        environment: 'production',
        status: 'SKIP',
        message: 'No configurado',
        suggestion: 'Configura tus credenciales de eBay Production en Settings → API Settings → eBay',
      });
    }
    
    // Test ScraperAPI
    const scraperapiCreds = await CredentialsManager.getCredentials(userId, 'scraperapi', 'production');
    if (scraperapiCreds?.apiKey) {
      const result = await testScraperAPI(scraperapiCreds.apiKey);
      const status: ApiTestStatus = result.success ? 'OK' : 'ERROR';
      results.push({
        name: 'ScraperAPI',
        provider: 'scraperapi',
        environment: 'other',
        status,
        message: result.message,
        latencyMs: result.latency,
        suggestion: generateSuggestion('scraperapi', status, result.message),
      });
    } else {
      results.push({
        name: 'ScraperAPI',
        provider: 'scraperapi',
        environment: 'other',
        status: 'SKIP',
        message: 'No configurado',
        suggestion: 'Configura tu API Key de ScraperAPI en Settings → API Settings → ScraperAPI',
      });
    }
    
    // Test ZenRows
    const zenrowsCreds = await CredentialsManager.getCredentials(userId, 'zenrows', 'production');
    if (zenrowsCreds?.apiKey) {
      const result = await testZenRows(zenrowsCreds.apiKey);
      const status: ApiTestStatus = result.success ? 'OK' : 'ERROR';
      results.push({
        name: 'ZenRows',
        provider: 'zenrows',
        environment: 'other',
        status,
        message: result.message,
        latencyMs: result.latency,
        suggestion: generateSuggestion('zenrows', status, result.message),
      });
    } else {
      results.push({
        name: 'ZenRows',
        provider: 'zenrows',
        environment: 'other',
        status: 'SKIP',
        message: 'No configurado',
        suggestion: 'Configura tu API Key de ZenRows en Settings → API Settings → ZenRows',
      });
    }
    
    // Test PayPal
    const paypalCreds = await CredentialsManager.getCredentials(userId, 'paypal', 'sandbox');
    if (paypalCreds) {
      const result = await testPayPal(paypalCreds, 'sandbox');
      const status: ApiTestStatus = result.success ? 'OK' : 'ERROR';
      results.push({
        name: 'PayPal (Sandbox)',
        provider: 'paypal',
        environment: 'sandbox',
        status,
        message: result.message,
        latencyMs: result.latency,
        suggestion: generateSuggestion('paypal', status, result.message),
      });
    } else {
      results.push({
        name: 'PayPal (Sandbox)',
        provider: 'paypal',
        environment: 'sandbox',
        status: 'SKIP',
        message: 'No configurado',
        suggestion: 'Configura tus credenciales de PayPal en Settings → API Settings → PayPal',
      });
    }
    
    // Test Stripe
    const stripeCreds = await CredentialsManager.getCredentials(userId, 'stripe', 'sandbox');
    if (stripeCreds) {
      const result = await testStripe(stripeCreds, 'sandbox');
      const status: ApiTestStatus = result.success ? 'OK' : 'ERROR';
      results.push({
        name: 'Stripe (Sandbox)',
        provider: 'stripe',
        environment: 'sandbox',
        status,
        message: result.message,
        latencyMs: result.latency,
        suggestion: generateSuggestion('stripe', status, result.message),
      });
    } else {
      results.push({
        name: 'Stripe (Sandbox)',
        provider: 'stripe',
        environment: 'sandbox',
        status: 'SKIP',
        message: 'No configurado',
        suggestion: 'Configura tus credenciales de Stripe en Settings → API Settings → Stripe',
      });
    }
    
    // Calcular resumen
    const ok = results.filter(r => r.status === 'OK').length;
    const error = results.filter(r => r.status === 'ERROR').length;
    const skip = results.filter(r => r.status === 'SKIP').length;
    
    return {
      ok,
      error,
      skip,
      total: results.length,
      results,
    };
    
  } catch (error: any) {
    logger.error('Error ejecutando tests de APIs', {
      error: error.message,
      stack: error.stack,
      userId,
    });
    throw error;
  }
}

export const ApiHealthService = {
  runAllApiTests,
};

