type Rates = Record<string, number>;

class FXService {
  private base = (process.env.FX_BASE_CURRENCY || 'USD').toUpperCase();
  private rates: Rates = {};

  constructor() {
    // Seed with env or sensible defaults
    try {
      if (process.env.FX_SEED_RATES) {
        this.rates = JSON.parse(process.env.FX_SEED_RATES);
      } else {
        this.rates = {
          USD: 1,
          EUR: 0.92,
          GBP: 0.79,
          MXN: 18.0,
          CLP: 950,
          BRL: 5.5,
          JPY: 150,
        };
      }
    } catch {
      this.rates = { USD: 1 };
    }
  }

  getBase() {
    return this.base;
  }

  getRates() {
    return { base: this.base, rates: { ...this.rates } };
  }

  setRates(rates: Rates) {
    this.rates = { ...this.rates, ...rates };
  }

  convert(amount: number, from: string, to: string): number {
    if (!isFinite(amount)) return 0;
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return amount;
    if (!this.rates[f] || !this.rates[t]) return amount; // fallback
    // Convert via base: amount_in_base = amount / rate[f]; then * rate[t]
    const amountInBase = amount / this.rates[f];
    return amountInBase * this.rates[t];
  }
}

const fxService = new FXService();
export default fxService;

