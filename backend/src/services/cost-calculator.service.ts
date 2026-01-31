import { trace } from '../utils/boot-trace';
trace('loading cost-calculator.service');

export interface CostBreakdown {
  marketplaceFee: number;
  paymentFee: number;
  shippingCost: number;
  importTax: number; // ✅ MEJORADO: Impuestos de importación (IVA/aranceles)
  taxes: number; // Mantener para compatibilidad (puede incluir otros impuestos)
  otherCosts: number;
  productCost: number; // ✅ MEJORADO: Costo base del producto
  totalCost: number; // ✅ MEJORADO: Costo total (producto + envío + impuestos + fees)
}

import fx from './fx.service';
import { logger } from '../config/logger';

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
    opts?: { 
      shippingCost?: number; 
      importTax?: number; // ✅ MEJORADO: Impuestos de importación (IVA/aranceles) como cantidad fija
      taxesPct?: number; // Otros impuestos como porcentaje (mantener para compatibilidad)
      otherCosts?: number;
    }
  ) {
    const cfg = this.defaults[marketplace] || this.defaults.ebay;
    const marketplaceFee = salePriceUsd * cfg.fee;
    const paymentFee = salePriceUsd * cfg.paymentFee;
    const shippingCost = opts?.shippingCost ?? 0;
    const importTax = opts?.importTax ?? 0; // ✅ MEJORADO: Impuestos de importación
    const taxes = salePriceUsd * (opts?.taxesPct ?? 0); // Otros impuestos como porcentaje
    const otherCosts = opts?.otherCosts ?? 0;
    
    // ✅ MEJORADO: Costo total incluye producto + envío + impuestos + fees
    const totalCost = sourceCostUsd + shippingCost + importTax + marketplaceFee + paymentFee + taxes + otherCosts;
    const netProfit = salePriceUsd - totalCost;
    // ✅ Redondear margen a 4 decimales para evitar problemas de precisión (mantener precisión para cálculos)
    const margin = salePriceUsd > 0 ? Math.round((netProfit / salePriceUsd) * 10000) / 10000 : 0;

    const breakdown: CostBreakdown = {
      productCost: sourceCostUsd,
      marketplaceFee,
      paymentFee,
      shippingCost,
      importTax, // ✅ MEJORADO
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
    opts?: { 
      shippingCost?: number; 
      importTax?: number; // ✅ MEJORADO: Impuestos de importación (IVA/aranceles) como cantidad fija
      taxesPct?: number; // Otros impuestos como porcentaje (mantener para compatibilidad)
      otherCosts?: number;
    }
  ) {
    const baseCfg = this.defaults[marketplace] || this.defaults.ebay;
    const overrides = this.regionFees[region]?.[marketplace] || {};
    const cfg = {
      fee: overrides.fee ?? baseCfg.fee,
      paymentFee: overrides.paymentFee ?? baseCfg.paymentFee,
    };

    // Convert source cost to sale currency
    let costInSaleCurrency = sourceCost;
    try {
      costInSaleCurrency = fx.convert(sourceCost, sourceCurrency, saleCurrency);
    } catch (error: any) {
      logger.warn('[CostCalculator] FX conversion failed, using source cost', {
        from: sourceCurrency,
        to: saleCurrency,
        amount: sourceCost,
        error: error?.message
      });
      // Fallback: usar costo sin convertir
      costInSaleCurrency = sourceCost;
    }
    const shippingCost = opts?.shippingCost ?? 0;
    const importTax = opts?.importTax ?? 0; // ✅ MEJORADO: Impuestos de importación
    const taxes = salePrice * (opts?.taxesPct ?? 0); // Otros impuestos como porcentaje
    const otherCosts = opts?.otherCosts ?? 0;

    const marketplaceFee = salePrice * cfg.fee;
    const paymentFee = salePrice * cfg.paymentFee;
    
    // ✅ MEJORADO: Costo total incluye producto + envío + impuestos + fees
    const totalCost = costInSaleCurrency + shippingCost + importTax + marketplaceFee + paymentFee + taxes + otherCosts;
    const netProfit = salePrice - totalCost;
    // ✅ Redondear margen a 4 decimales para evitar problemas de precisión (mantener precisión para cálculos)
    const margin = salePrice > 0 ? Math.round((netProfit / salePrice) * 10000) / 10000 : 0;

    return {
      breakdown: { 
        productCost: costInSaleCurrency,
        marketplaceFee, 
        paymentFee, 
        shippingCost, 
        importTax, // ✅ MEJORADO
        taxes, 
        otherCosts, 
        totalCost 
      },
      netProfit,
      margin,
    };
  }
}

const costCalculator = new CostCalculatorService();
export default costCalculator;
