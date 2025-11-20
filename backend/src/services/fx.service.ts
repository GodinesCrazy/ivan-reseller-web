import axios from 'axios';
import { logger } from '../config/logger';

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
  private refreshInFlight: Promise<void> | null = null;
  
  // ✅ Monedas que no usan decimales (redondear a enteros)
  private readonly zeroDecimalCurrencies = new Set(['CLP', 'JPY', 'KRW', 'VND', 'IDR']);

  constructor() {
    this.seedRates();

    if (this.providerEnabled) {
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
      provider: this.providerEnabled ? 'exchangerate.host' : 'manual',
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
      return `https://open.er-api.com/v6/latest/${base}`;
    }

    if (this.providerUrl.includes('{base}')) {
      return this.providerUrl.replace('{base}', base);
    }

    try {
      const url = new URL(this.providerUrl);
      url.searchParams.set('base', base);
      if (this.providerSymbols) {
        url.searchParams.set('symbols', this.providerSymbols);
      }
      return url.toString();
    } catch {
      const separator = this.providerUrl.includes('?') ? '&' : '?';
      const symbolsParam = this.providerSymbols ? `&symbols=${encodeURIComponent(this.providerSymbols)}` : '';
      return `${this.providerUrl}${separator}base=${base}${symbolsParam}`;
    }
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
      const response = await axios.get(url, { timeout: 10_000 });
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
        providerBase = (data.base_code || targetBase || this.base).toUpperCase();
        if (data.time_last_update_unix) {
          timestamp = new Date(data.time_last_update_unix * 1000);
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

  convert(amount: number, from: string, to: string): number {
    if (!isFinite(amount)) return 0;
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return this.roundCurrency(amount, t);
    
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
      // ✅ CORREGIDO: Lanzar error si falta tasa en lugar de retornar amount sin convertir
      throw new Error(`Missing exchange rate for conversion: ${f} to ${t}. Available rates: ${Object.keys(this.rates).slice(0, 10).join(', ')}`);
    }
    
    const amountInBase = amount / this.rates[f];
    const converted = amountInBase * this.rates[t];
    
    // ✅ Redondear según tipo de moneda destino
    const rounded = this.roundCurrency(converted, t);
    
    // ✅ Logging para diagnóstico (solo para conversiones importantes)
    if (f === 'CLP' || t === 'CLP' || amount > 1000 || Math.abs(converted - rounded) > 0.01) {
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

const fxService = new FXService();
export default fxService;

