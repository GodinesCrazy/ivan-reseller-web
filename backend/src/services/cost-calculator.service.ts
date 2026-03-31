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
import { getDefaultShippingCost } from '../utils/shipping.utils';

export class CostCalculatorService {
  // FASE 0 Fix: fees canónicos alineados con canonical-cost-engine y realidad del mercado.
  // Antes: eBay 12.5%, ML 11%, payment 2.9% flat (sin fijo $0.49).
  // Ahora: eBay 12.85%, ML 13.9%, Amazon 15%, payment 3.49% + $0.49 fijo.
  private defaults = {
    ebay: { fee: 0.1285, paymentFee: 0.0349, paymentFixed: 0.49 },
    amazon: { fee: 0.15, paymentFee: 0.0349, paymentFixed: 0.49 },
    mercadolibre: { fee: 0.139, paymentFee: 0.0349, paymentFixed: 0.49 },
  } as const;

  // Region overrides (FASE 0: alineados con canonical-cost-engine)
  private regionFees: Record<string, Partial<Record<'ebay' | 'amazon' | 'mercadolibre', { fee?: number; paymentFee?: number }>>> = {
    uk: { ebay: { fee: 0.1285 } },
    de: { ebay: { fee: 0.1285 } },
    mx: { mercadolibre: { fee: 0.139 } },
    br: { mercadolibre: { fee: 0.16 } },
    cl: { mercadolibre: { fee: 0.139 } },
    ar: { mercadolibre: { fee: 0.139 } },
  };

  calculate(
    marketplace: 'ebay' | 'amazon' | 'mercadolibre',
    salePriceUsd: number,
    sourceCostUsd: number,
    opts?: {
      shippingCost?: number;
      importTax?: number;   // Impuestos de importación como cantidad fija en USD
      taxesPct?: number;    // Otros impuestos como porcentaje
      otherCosts?: number;
    }
  ) {
    const cfg = this.defaults[marketplace] || this.defaults.ebay;
    const marketplaceFee = salePriceUsd * cfg.fee;
    // FASE 0 Fix: payment fee ahora incluye componente fijo $0.49 (era solo porcentual)
    const paymentFee = salePriceUsd * cfg.paymentFee + cfg.paymentFixed;
    const shippingCost = opts?.shippingCost ?? getDefaultShippingCost();
    const importTax = opts?.importTax ?? 0;
    const taxes = salePriceUsd * (opts?.taxesPct ?? 0);
    const otherCosts = opts?.otherCosts ?? 0;

    const totalCost = sourceCostUsd + shippingCost + importTax + marketplaceFee + paymentFee + taxes + otherCosts;
    const netProfit = salePriceUsd - totalCost;
    const margin = salePriceUsd > 0 ? Math.round((netProfit / salePriceUsd) * 10000) / 10000 : 0;

    const breakdown: CostBreakdown = {
      productCost: sourceCostUsd,
      marketplaceFee,
      paymentFee,
      shippingCost,
      importTax,
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
    const shippingCost = opts?.shippingCost ?? getDefaultShippingCost();
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
