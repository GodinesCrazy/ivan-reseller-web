import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';
import { redis, isRedisAvailable } from '../config/redis';
// ✅ PRODUCTION READY: Usar cliente HTTP centralizado con timeout
import { fastHttpClient } from '../config/http-client';

type Rates = Record<string, number>;

interface SetRatesOptions {
  base?: string;
  replace?: boolean;
  timestamp?: Date | string | null;
}

class FXService {
  private base = (process.env.FX_BASE_CURRENCY || 'USD').toUpperCase();
  private rates: Rates = {};
  private lastUpdated: Date | null = null;
  private providerEnabled = (process.env.FX_PROVIDER_ENABLED || 'true').toLowerCase() !== 'false';
  private providerUrl = process.env.FX_PROVIDER_URL || 'https://open.er-api.com/v6/latest/{base}';
  private providerSymbols = process.env.FX_PROVIDER_SYMBOLS;
  private providerApiKey = process.env.EXCHANGERATE_API_KEY || process.env.FX_API_KEY; // Soporte para API Key
  private refreshInFlight: Promise<void> | null = null;

  // ✅ Monedas que no usan decimales (redondear a enteros)
  private readonly zeroDecimalCurrencies = new Set(['CLP', 'JPY', 'KRW', 'VND', 'IDR']);

  // ✅ P8: Caché en memoria para conversiones (síncrono)
  private conversionCache: Map<string, { value: number; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

  constructor(options?: { autoStart?: boolean }) {
    this.seedRates();

    // ✅ TEST FIX: No auto-refresh in test environment or if disabled
    const autoRefreshEnabled = (process.env.FX_AUTO_REFRESH_ENABLED ?? 'true') === 'true';
    const shouldAutoStart = options?.autoStart !== false && autoRefreshEnabled && this.providerEnabled;
    
    if (shouldAutoStart) {
      void this.refreshRates().catch((error: any) => {
        logger.warn('FXService: initial refresh failed', {
          error: error?.message || String(error),
        });
      });
    }
  }

  private seedRates() {
    try {
      if (process.env.FX_SEED_RATES) {
        const parsed = JSON.parse(process.env.FX_SEED_RATES);
        this.setRates(parsed, { replace: true, timestamp: null });
        return;
      }
    } catch (error: any) {
      logger.warn('FXService: failed to parse FX_SEED_RATES', {
        error: error?.message || String(error),
      });
    }

    this.setRates(
      {
        USD: 1,
        EUR: 0.92,
        GBP: 0.79,
        MXN: 18.0,
        CLP: 950,
        BRL: 5.5,
        JPY: 150,
      },
      { replace: true, timestamp: null }
    );
  }

  isProviderEnabled(): boolean {
    return this.providerEnabled;
  }

  getBase() {
    return this.base;
  }

  getRates() {
    return {
      base: this.base,
      rates: { ...this.rates },
      lastUpdated: this.lastUpdated?.toISOString() ?? null,
      provider: this.providerEnabled 
        ? (this.providerApiKey ? 'exchangerate-api.com' : 'open.er-api.com')
        : 'manual',
      hasApiKey: !!this.providerApiKey,
    };
  }

  setRates(rates: Rates, options: SetRatesOptions = {}) {
    const replace = options.replace !== false;
    const normalizedBase = options.base ? options.base.toUpperCase() : this.base;

    if (replace) {
      this.rates = {};
    }

    const normalizedRates: Rates = replace ? {} : { ...this.rates };
    Object.entries(rates || {}).forEach(([currency, value]) => {
      const code = currency.toUpperCase();
      if (typeof value === 'number' && isFinite(value) && value > 0) {
        normalizedRates[code] = value;
      }
    });

    normalizedRates[normalizedBase] = 1;

    this.base = normalizedBase;
    this.rates = normalizedRates;

    if (options.timestamp === null) {
      this.lastUpdated = null;
    } else if (options.timestamp) {
      this.lastUpdated = new Date(options.timestamp);
    } else {
      this.lastUpdated = new Date();
    }
  }

  getLastUpdated(): Date | null {
    return this.lastUpdated;
  }

  private buildProviderUrl(base: string): string {
    if (!this.providerUrl) {
      // ✅ Si hay API Key, usar exchangerate-api.com (más profesional)
      if (this.providerApiKey) {
        return `https://v6.exchangerate-api.com/v6/${this.providerApiKey}/latest/${base}`;
      }
      return `https://open.er-api.com/v6/latest/${base}`;
    }

    let url: string;
    if (this.providerUrl.includes('{base}')) {
      url = this.providerUrl.replace('{base}', base);
    } else {
      try {
        const urlObj = new URL(this.providerUrl);
        urlObj.searchParams.set('base', base);
        if (this.providerSymbols) {
          urlObj.searchParams.set('symbols', this.providerSymbols);
        }
        // ✅ Agregar API Key si está disponible y la URL lo soporta
        if (this.providerApiKey) {
          // Para exchangerate-api.com, la API key va en la URL
          if (urlObj.hostname.includes('exchangerate-api.com')) {
            // Ya está en la URL en buildProviderUrl
          } else {
            // Para otros proveedores, agregar como query param
            urlObj.searchParams.set('apikey', this.providerApiKey);
          }
        }
        url = urlObj.toString();
      } catch {
        const separator = this.providerUrl.includes('?') ? '&' : '?';
        const symbolsParam = this.providerSymbols ? `&symbols=${encodeURIComponent(this.providerSymbols)}` : '';
        const apiKeyParam = this.providerApiKey ? `&apikey=${encodeURIComponent(this.providerApiKey)}` : '';
        url = `${this.providerUrl}${separator}base=${base}${symbolsParam}${apiKeyParam}`;
      }
    }

    return url;
  }

  async refreshRates(base: string = this.base): Promise<void> {
    if (!this.providerEnabled) {
      return;
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const targetBase = base.toUpperCase();

    this.refreshInFlight = (async () => {
      const url = this.buildProviderUrl(targetBase);
      
      // ✅ Configurar headers con API Key si es necesario (para algunos proveedores)
      const headers: Record<string, string> = {};
      if (this.providerApiKey && !url.includes(this.providerApiKey)) {
        // Si la API key no está en la URL, agregarla como header
        headers['apikey'] = this.providerApiKey;
      }
      
      // ✅ PRODUCTION READY: Usar cliente HTTP centralizado (ya tiene timeout de 10s)
      const response = await fastHttpClient.get(url, { 
        headers: Object.keys(headers).length > 0 ? headers : undefined
      });
      const data = response.data;
      if (!data || typeof data !== 'object') {
        throw new Error('Empty FX provider response');
      }

      let providerBase = targetBase;
      let timestamp: Date | null = null;
      let rates: Rates | null = null;

      if (Array.isArray((data as any).rates) || typeof (data as any).rates === 'object') {
        providerBase = (data.base || data.base_code || targetBase || this.base).toUpperCase();
        if (data.time_last_update_unix) {
          timestamp = new Date(data.time_last_update_unix * 1000);
        } else if (data.date) {
          timestamp = new Date(data.date);
        } else if (data.time_last_update_utc) {
          timestamp = new Date(data.time_last_update_utc);
        }
        rates = data.rates as Rates;
      } else if (data.conversion_rates) {
        // ✅ Formato exchangerate-api.com
        providerBase = (data.base_code || targetBase || this.base).toUpperCase();
        if (data.time_last_update_unix) {
          timestamp = new Date(data.time_last_update_unix * 1000);
        } else if (data.time_last_update_utc) {
          timestamp = new Date(data.time_last_update_utc);
        }
        rates = data.conversion_rates as Rates;
      } else if (data.result === 'success' && data.conversion_rates) {
        // ✅ Formato alternativo exchangerate-api.com
        providerBase = (data.base_code || targetBase || this.base).toUpperCase();
        if (data.time_last_update_unix) {
          timestamp = new Date(data.time_last_update_unix * 1000);
        } else if (data.time_last_update_utc) {
          timestamp = new Date(data.time_last_update_utc);
        }
        rates = data.conversion_rates as Rates;
      }

      if (!rates) {
        if (data.result && data.result !== 'success' && data.error_type) {
          throw new Error(`${data.error_type}`);
        }
        throw new Error('Invalid FX provider response');
      }

      this.setRates(rates, {
        base: providerBase,
        replace: true,
        timestamp: timestamp ?? undefined,
      });

      logger.info('FXService: rates refreshed from provider', {
        base: providerBase,
        providerUrl: this.providerUrl,
        lastUpdated: this.lastUpdated?.toISOString(),
      });
    })()
      .catch((error: any) => {
        logger.error('FXService: failed to refresh rates', {
          base: targetBase,
          providerUrl: this.providerUrl,
          error: error?.message || String(error),
        });
        throw error;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  /**
   * ✅ Redondear cantidad según tipo de moneda
   * - Monedas sin decimales (CLP, JPY, etc.): redondear a entero
   * - Otras monedas: redondear a 2 decimales (centavos)
   */
  private roundCurrency(amount: number, currency: string): number {
    if (!isFinite(amount)) return 0;
    const currencyCode = currency.toUpperCase();

    if (this.zeroDecimalCurrencies.has(currencyCode)) {
      // ✅ Monedas sin decimales: redondear a entero
      return Math.round(amount);
    } else {
      // ✅ Otras monedas: redondear a 2 decimales (centavos)
      return Math.round(amount * 100) / 100;
    }
  }

  /**
   * ✅ P8: Obtener clave de caché para conversión
   */
  private getCacheKey(amount: number, from: string, to: string): string {
    // Redondear amount a 2 decimales para evitar claves diferentes por diferencias mínimas
    const roundedAmount = Math.round(amount * 100) / 100;
    return `fx:convert:${from.toUpperCase()}:${to.toUpperCase()}:${roundedAmount}`;
  }

  /**
   * ✅ P8: Convertir con caché de conversiones (síncrono con caché en memoria)
   */
  convert(amount: number | Prisma.Decimal, from: string, to: string): number {
    const numAmount = typeof amount === 'number' ? amount : amount.toNumber();
    if (!isFinite(numAmount)) return 0;
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return this.roundCurrency(numAmount, t);

    // ✅ P8: Intentar obtener del caché en memoria primero (síncrono)
    const cacheKey = this.getCacheKey(numAmount, f, t);
    const cached = this.conversionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      logger.debug('FXService: conversion cache hit (memory)', { from: f, to: t, amount });
      return cached.value;
    }

    // ✅ P8: Intentar obtener del caché Redis (async, no bloquea)
    if (isRedisAvailable) {
      redis.get(cacheKey).then((cachedRedis: string | null) => {
        if (cachedRedis) {
          try {
            const parsed = JSON.parse(cachedRedis);
            // Actualizar caché en memoria
            this.conversionCache.set(cacheKey, { value: parsed.value, timestamp: parsed.timestamp || Date.now() });
            logger.debug('FXService: conversion cache hit (Redis)', { from: f, to: t, amount });
          } catch (error) {
            // Si falla parsear, ignorar
          }
        }
      }).catch(() => {
        // Si falla el caché Redis, continuar con cálculo normal
      });
    }

    // ✅ Verificar que tenemos las tasas necesarias
    if (!this.rates[f] || !this.rates[t]) {
      logger.warn('FXService: missing rate for conversion', {
        from: f,
        to: t,
        availableRates: Object.keys(this.rates).slice(0, 10),
        hasFromRate: !!this.rates[f],
        hasToRate: !!this.rates[t]
      });
      // Si falta la tasa, intentar refrescar (pero no esperar)
      if (this.providerEnabled && !this.refreshInFlight) {
        this.refreshRates().catch(() => {
          // Si falla el refresh, se lanzará error en siguiente intento
        });
      }
      // ✅ CORRECCIÓN: Si falta la tasa y la moneda origen es inválida (ej: "IOS"), usar USD como fallback
      // Esto previene errores cuando se detecta incorrectamente una moneda no válida
      const invalidCurrencyCodes = new Set(['IOS', 'AND', 'OR', 'NOT', 'API', 'URL', 'HTML', 'CSS', 'JS']);
      if (invalidCurrencyCodes.has(f)) {
        logger.warn('FXService: Invalid currency code detected, using USD as fallback', {
          invalidCode: f,
          to: t,
          amount: numAmount
        });
        // Intentar convertir desde USD en lugar de la moneda inválida
        if (this.rates['USD'] && this.rates[t]) {
          return this.roundCurrency(numAmount * (this.rates[t] / this.rates['USD']), t);
        }
      }
      
      // ✅ CORREGIDO: Lanzar error si falta tasa en lugar de retornar amount sin convertir
      throw new Error(`Missing exchange rate for conversion: ${f} to ${t}. Available rates: ${Object.keys(this.rates).slice(0, 10).join(', ')}`);
    }

    const amountInBase = numAmount / this.rates[f];
    const converted = amountInBase * this.rates[t];

    // ✅ Redondear según tipo de moneda destino
    const rounded = this.roundCurrency(converted, t);

    // ✅ P8: Guardar en caché en memoria (síncrono)
    const timestamp = Date.now();
    this.conversionCache.set(cacheKey, { value: rounded, timestamp });

    // ✅ P8: Limpiar caché antiguo (mantener solo últimas 1000 entradas)
    if (this.conversionCache.size > 1000) {
      const entries = Array.from(this.conversionCache.entries());
      const now = Date.now();
      entries.forEach(([key, value]) => {
        if ((now - value.timestamp) > this.CACHE_TTL_MS) {
          this.conversionCache.delete(key);
        }
      });
      // Si aún hay demasiadas, eliminar las más antiguas
      if (this.conversionCache.size > 1000) {
        const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        sorted.slice(0, sorted.length - 1000).forEach(([key]) => {
          this.conversionCache.delete(key);
        });
      }
    }

    // ✅ P8: Guardar en caché Redis (async, no bloquea)
    if (isRedisAvailable) {
      try {
        // Cachear por 1 hora (3600 segundos) - las tasas cambian lentamente
        redis.setex(cacheKey, 3600, JSON.stringify({ value: rounded, timestamp }))
          .catch((error) => {
            logger.debug('FXService: failed to cache conversion in Redis', { error: error.message });
          });
      } catch (error) {
        // Si falla el caché Redis, no es crítico, continuar
      }
    }

    // ✅ Logging para diagnóstico (solo para conversiones importantes)
    if (f === 'CLP' || t === 'CLP' || numAmount > 1000 || Math.abs(converted - rounded) > 0.01) {
      logger.debug('FXService: conversion', {
        from: f,
        to: t,
        originalAmount: amount,
        convertedAmount: converted,
        roundedAmount: rounded,
        fromRate: this.rates[f],
        toRate: this.rates[t]
      });
    }

    return rounded;
  }
}

// ✅ TEST FIX: Lazy initialization to prevent side-effects in tests
let fxServiceSingleton: FXService | null = null;

export function getFXService(): FXService {
  if (!fxServiceSingleton) {
    const autoRefreshEnabled = (process.env.FX_AUTO_REFRESH_ENABLED ?? 'true') === 'true';
    fxServiceSingleton = new FXService({ autoStart: autoRefreshEnabled });
  }
  return fxServiceSingleton;
}

// Default export for backward compatibility (lazy - no side effects on import)
const fxService = new Proxy({} as FXService, {
  get(_target, prop) {
    const service = getFXService();
    const value = service[prop as keyof FXService];
    // Bind methods to maintain 'this' context
    if (typeof value === 'function') {
      return value.bind(service);
    }
    return value;
  }
});

export default fxService;

