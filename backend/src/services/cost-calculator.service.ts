export interface CostBreakdown {
  marketplaceFee: number;
  paymentFee: number;
  shippingCost: number;
  taxes: number;
  otherCosts: number;
  totalCost: number;
}

import fx from './fx.service';

export class CostCalculatorService {
  // Base default fees; region can override
  private defaults = {
    ebay: { fee: 0.125, paymentFee: 0.029 },
    amazon: { fee: 0.15, paymentFee: 0.029 },
    mercadolibre: { fee: 0.11, paymentFee: 0.029 },
  } as const;

  // Region overrides
  private regionFees: Record<string, Partial<Record<'ebay' | 'amazon' | 'mercadolibre', { fee?: number; paymentFee?: number }>>> = {
    uk: { ebay: { fee: 0.13 } },
    de: { ebay: { fee: 0.13 } },
    mx: { mercadolibre: { fee: 0.13 } },
    br: { mercadolibre: { fee: 0.16 } },
  };

  calculate(
    marketplace: 'ebay' | 'amazon' | 'mercadolibre',
    salePriceUsd: number,
    sourceCostUsd: number,
    opts?: { shippingCost?: number; taxesPct?: number; otherCosts?: number }
  ) {
    const cfg = this.defaults[marketplace] || this.defaults.ebay;
    const marketplaceFee = salePriceUsd * cfg.fee;
    const paymentFee = salePriceUsd * cfg.paymentFee;
    const shippingCost = opts?.shippingCost ?? 0;
    const taxes = salePriceUsd * (opts?.taxesPct ?? 0);
    const otherCosts = opts?.otherCosts ?? 0;
    const totalCost = sourceCostUsd + marketplaceFee + paymentFee + shippingCost + taxes + otherCosts;
    const netProfit = salePriceUsd - totalCost;
    // ✅ Redondear margen a 4 decimales para evitar problemas de precisión
    const margin = salePriceUsd > 0 ? Math.round((netProfit / salePriceUsd) * 10000) / 10000 : 0;

    const breakdown: CostBreakdown = {
      marketplaceFee,
      paymentFee,
      shippingCost,
      taxes,
      otherCosts,
      totalCost,
    };

    return { breakdown, netProfit, margin };
  }

  calculateAdvanced(
    marketplace: 'ebay' | 'amazon' | 'mercadolibre',
    region: string,
    salePrice: number,
    sourceCost: number,
    saleCurrency: string,
    sourceCurrency: string,
    opts?: { shippingCost?: number; taxesPct?: number; otherCosts?: number }
  ) {
    const baseCfg = this.defaults[marketplace] || this.defaults.ebay;
    const overrides = this.regionFees[region]?.[marketplace] || {};
    const cfg = {
      fee: overrides.fee ?? baseCfg.fee,
      paymentFee: overrides.paymentFee ?? baseCfg.paymentFee,
    };

    // Convert source cost to sale currency
    const costInSaleCurrency = fx.convert(sourceCost, sourceCurrency, saleCurrency);
    const shippingCost = opts?.shippingCost ?? 0;
    const taxes = salePrice * (opts?.taxesPct ?? 0);
    const otherCosts = opts?.otherCosts ?? 0;

    const marketplaceFee = salePrice * cfg.fee;
    const paymentFee = salePrice * cfg.paymentFee;
    const totalCost = costInSaleCurrency + marketplaceFee + paymentFee + shippingCost + taxes + otherCosts;
    const netProfit = salePrice - totalCost;
    // ✅ Redondear margen a 4 decimales para evitar problemas de precisión
    const margin = salePrice > 0 ? Math.round((netProfit / salePrice) * 10000) / 10000 : 0;

    return {
      breakdown: { marketplaceFee, paymentFee, shippingCost, taxes, otherCosts, totalCost },
      netProfit,
      margin,
    };
  }
}

const costCalculator = new CostCalculatorService();
export default costCalculator;
