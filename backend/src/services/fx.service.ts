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
  private providerUrl = process.env.FX_PROVIDER_URL || 'https://api.exchangerate.host/latest';
  private providerSymbols = process.env.FX_PROVIDER_SYMBOLS;
  private refreshInFlight: Promise<void> | null = null;

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
      return `https://api.exchangerate.host/latest?base=${base}`;
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
      if (!data || typeof data !== 'object' || !data.rates) {
        throw new Error('Invalid FX provider response');
      }

      const providerBase = (data.base || targetBase || this.base).toUpperCase();
      const timestamp = data.time_last_update_unix
        ? new Date(data.time_last_update_unix * 1000)
        : data.date
        ? new Date(data.date)
        : new Date();

      this.setRates(data.rates, {
        base: providerBase,
        replace: true,
        timestamp,
      });

      logger.info('FXService: rates refreshed from provider', {
        base: providerBase,
        lastUpdated: this.lastUpdated?.toISOString(),
      });
    })()
      .catch((error: any) => {
        logger.error('FXService: failed to refresh rates', {
          base: targetBase,
          error: error?.message || String(error),
        });
        throw error;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  convert(amount: number, from: string, to: string): number {
    if (!isFinite(amount)) return 0;
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return amount;
    if (!this.rates[f] || !this.rates[t]) return amount;
    const amountInBase = amount / this.rates[f];
    return amountInBase * this.rates[t];
  }
}

const fxService = new FXService();
export default fxService;

