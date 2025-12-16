/**
 * HTTP Client Configuration
 * Configuración centralizada de clientes HTTP con timeouts apropiados
 * 
 * PRODUCTION READY: Todos los clientes tienen timeouts para prevenir bloqueos indefinidos
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { logger } from './logger';

/**
 * Cliente HTTP estándar para la mayoría de APIs
 * Timeout: 30 segundos (apropiado para APIs de marketplaces)
 */
export const httpClient: AxiosInstance = axios.create({
  timeout: 30000, // 30 segundos
  headers: {
    'User-Agent': 'Ivan-Reseller/1.0',
    'Content-Type': 'application/json',
  },
});

/**
 * Cliente HTTP rápido para APIs con respuesta rápida
 * Timeout: 10 segundos (GROQ, validaciones, health checks)
 */
export const fastHttpClient: AxiosInstance = axios.create({
  timeout: 10000, // 10 segundos
  headers: {
    'User-Agent': 'Ivan-Reseller/1.0',
    'Content-Type': 'application/json',
  },
});

/**
 * Cliente HTTP lento para operaciones que requieren más tiempo
 * Timeout: 120 segundos (scraping, Puppeteer, operaciones pesadas)
 */
export const slowHttpClient: AxiosInstance = axios.create({
  timeout: 120000, // 120 segundos (2 minutos)
  headers: {
    'User-Agent': 'Ivan-Reseller/1.0',
    'Content-Type': 'application/json',
  },
});

/**
 * Cliente HTTP para scraping específicamente
 * Timeout: 60 segundos (balance entre velocidad y completitud)
 */
export const scrapingHttpClient: AxiosInstance = axios.create({
  timeout: 60000, // 60 segundos
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  },
});

// Interceptores para logging de errores
const setupErrorLogging = (client: AxiosInstance, clientName: string) => {
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          logger.warn(`[${clientName}] Request timeout`, {
            url: error.config?.url,
            method: error.config?.method,
            timeout: error.config?.timeout,
          });
        } else if (error.response) {
          // Error de respuesta del servidor
          logger.warn(`[${clientName}] API error response`, {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response.status,
            statusText: error.response.statusText,
          });
        } else if (error.request) {
          // Request enviado pero sin respuesta
          logger.error(`[${clientName}] No response received`, {
            url: error.config?.url,
            method: error.config?.method,
          });
        }
      }
      return Promise.reject(error);
    }
  );
};

// Configurar logging para todos los clientes
setupErrorLogging(httpClient, 'httpClient');
setupErrorLogging(fastHttpClient, 'fastHttpClient');
setupErrorLogging(slowHttpClient, 'slowHttpClient');
setupErrorLogging(scrapingHttpClient, 'scrapingHttpClient');

export default httpClient;

