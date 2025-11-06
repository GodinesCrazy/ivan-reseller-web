import logger from '../config/logger';

/**
 * Retry utility con exponential backoff
 * Maneja reintentos automáticos con estrategias configurables
 */

export interface RetryOptions {
  maxRetries?: number; // Número máximo de reintentos (default: 3)
  initialDelay?: number; // Delay inicial en ms (default: 1000)
  maxDelay?: number; // Delay máximo en ms (default: 30000)
  backoffMultiplier?: number; // Multiplicador para exponential backoff (default: 2)
  jitter?: boolean; // Agregar jitter aleatorio para evitar thundering herd (default: true)
  onRetry?: (attempt: number, error: Error, delay: number) => void; // Callback en cada reintento
  retryCondition?: (error: Error) => boolean; // Condición para decidir si reintentar
  timeout?: number; // Timeout por intento en ms (opcional)
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

/**
 * Retry con exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    onRetry,
    retryCondition,
    timeout,
  } = options;

  const startTime = Date.now();
  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Si hay timeout, envolver la función en Promise.race
      let result: T;
      if (timeout) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
        });
        result = await Promise.race([fn(), timeoutPromise]);
      } else {
        result = await fn();
      }

      const totalTime = Date.now() - startTime;

      return {
        success: true,
        data: result,
        attempts: attempt + 1,
        totalTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Verificar si debemos reintentar
      if (attempt === maxRetries) {
        // Último intento falló
        const totalTime = Date.now() - startTime;
        logger.error('Retry exhausted', {
          attempts: attempt + 1,
          error: lastError.message,
          totalTime,
        });

        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          totalTime,
        };
      }

      // Verificar condición de retry personalizada
      if (retryCondition && !retryCondition(lastError)) {
        const totalTime = Date.now() - startTime;
        logger.warn('Retry condition not met', {
          attempts: attempt + 1,
          error: lastError.message,
        });

        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          totalTime,
        };
      }

      // Calcular delay con exponential backoff
      const baseDelay = Math.min(delay, maxDelay);
      const finalDelay = jitter
        ? baseDelay + Math.random() * 1000 // Agregar jitter aleatorio
        : baseDelay;

      // Callback de retry
      if (onRetry) {
        onRetry(attempt + 1, lastError, finalDelay);
      }

      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries}`, {
        error: lastError.message,
        delay: finalDelay,
        nextAttempt: attempt + 2,
      });

      // Esperar antes del siguiente intento
      await new Promise((resolve) => setTimeout(resolve, finalDelay));

      // Incrementar delay para siguiente intento
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  // Nunca debería llegar aquí, pero por seguridad
  const totalTime = Date.now() - startTime;
  return {
    success: false,
    error: lastError || new Error('Unknown error'),
    attempts: maxRetries + 1,
    totalTime,
  };
}

/**
 * Retry específico para errores de red (5xx, timeout, ECONNRESET, etc.)
 */
export function isRetryableNetworkError(error: Error): boolean {
  const retryableErrors = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'timeout',
    'network',
    'fetch failed',
  ];

  const errorMessage = error.message.toLowerCase();
  const errorCode = (error as any).code?.toLowerCase() || '';

  return (
    retryableErrors.some((retryable) => errorMessage.includes(retryable) || errorCode.includes(retryable)) ||
    errorMessage.includes('500') ||
    errorMessage.includes('502') ||
    errorMessage.includes('503') ||
    errorMessage.includes('504')
  );
}

/**
 * Retry específico para errores de rate limiting (429)
 */
export function isRateLimitError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes('429') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    (error as any).status === 429 ||
    (error as any).response?.status === 429
  );
}

/**
 * Retry específico para errores de rate limiting con delay aumentado
 */
export async function retryWithRateLimitBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const customOptions: RetryOptions = {
    ...options,
    initialDelay: options.initialDelay || 5000, // Delay inicial mayor para rate limits
    maxDelay: options.maxDelay || 60000, // Delay máximo de 60 segundos
    retryCondition: (error) => {
      // Si es rate limit, siempre reintentar
      if (isRateLimitError(error)) {
        return true;
      }
      // Si hay condición personalizada, usarla
      if (options.retryCondition) {
        return options.retryCondition(error);
      }
      // Por defecto, solo reintentar errores de red
      return isRetryableNetworkError(error);
    },
    onRetry: (attempt, error, delay) => {
      if (isRateLimitError(error)) {
        logger.warn(`Rate limit hit, waiting ${delay}ms before retry ${attempt}`, {
          delay,
          attempt,
        });
      }
      if (options.onRetry) {
        options.onRetry(attempt, error, delay);
      }
    },
  };

  return retryWithBackoff(fn, customOptions);
}

/**
 * Retry específico para operaciones de marketplace
 */
export async function retryMarketplaceOperation<T>(
  fn: () => Promise<T>,
  marketplace: 'ebay' | 'mercadolibre' | 'amazon',
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  // Configuración específica por marketplace
  const marketplaceConfigs: Record<string, Partial<RetryOptions>> = {
    ebay: {
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 30000,
      timeout: 10000,
    },
    mercadolibre: {
      maxRetries: 3,
      initialDelay: 1500,
      maxDelay: 30000,
      timeout: 10000,
    },
    amazon: {
      maxRetries: 4,
      initialDelay: 2000,
      maxDelay: 45000,
      timeout: 15000,
    },
  };

  const config = marketplaceConfigs[marketplace] || {};
  const finalOptions: RetryOptions = {
    ...config,
    ...options,
    retryCondition: (error) => {
      // Rate limit siempre se reintenta
      if (isRateLimitError(error)) {
        return true;
      }
      // Errores de red siempre se reintentan
      if (isRetryableNetworkError(error)) {
        return true;
      }
      // Errores 5xx se reintentan
      const status = (error as any).status || (error as any).response?.status;
      if (status >= 500 && status < 600) {
        return true;
      }
      // Condición personalizada
      if (options.retryCondition) {
        return options.retryCondition(error);
      }
      // No reintentar errores 4xx (excepto 429)
      return false;
    },
    onRetry: (attempt, error, delay) => {
      logger.warn(`Marketplace operation retry (${marketplace})`, {
        attempt,
        error: error.message,
        delay,
        marketplace,
      });
      if (options.onRetry) {
        options.onRetry(attempt, error, delay);
      }
    },
  };

  return retryWithBackoff(fn, finalOptions);
}

/**
 * Retry específico para operaciones de scraping
 */
export async function retryScrapingOperation<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const scrapingOptions: RetryOptions = {
    maxRetries: 5, // Más intentos para scraping (puede ser bloqueado temporalmente)
    initialDelay: 3000, // Delay inicial mayor
    maxDelay: 60000, // Delay máximo de 60 segundos
    backoffMultiplier: 2.5, // Backoff más agresivo
    jitter: true,
    timeout: 30000, // Timeout de 30 segundos para scraping
    ...options,
    retryCondition: (error) => {
      // Reintentar todos los errores de scraping (pueden ser bloqueos temporales)
      if (options.retryCondition) {
        return options.retryCondition(error);
      }
      return true; // Reintentar todo en scraping
    },
    onRetry: (attempt, error, delay) => {
      logger.warn(`Scraping operation retry`, {
        attempt,
        error: error.message,
        delay,
      });
      if (options.onRetry) {
        options.onRetry(attempt, error, delay);
      }
    },
  };

  return retryWithBackoff(fn, scrapingOptions);
}

/**
 * Wrapper para funciones async que automáticamente aplica retry
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    const result = await retryWithBackoff(() => fn(...args), options);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  }) as T;
}

