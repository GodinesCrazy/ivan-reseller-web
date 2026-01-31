/**
 * ✅ Q13: Servicio Centralizado de Cálculos Financieros
 * 
 * Centraliza todos los cálculos de márgenes, ganancias, ROI y costos
 * para evitar duplicación de código y asegurar consistencia.
 */

import { trace } from '../utils/boot-trace';
trace('loading financial-calculations.service');

import fx from './fx.service';

export interface ProfitCalculationInput {
  sourcePrice: number;
  targetPrice: number;
  sourceCurrency?: string;
  targetCurrency?: string;
  marketplace?: 'ebay' | 'amazon' | 'mercadolibre';
  fees?: {
    marketplaceFee?: number;    // % del precio de venta
    paymentFee?: number;        // % del precio de venta
    shippingCost?: number;      // cantidad fija
    packagingCost?: number;     // cantidad fija
    advertisingCost?: number;    // cantidad fija
    taxesPct?: number;           // % del precio de venta
    otherCosts?: number;        // cantidad fija
  };
}

export interface ProfitCalculationResult {
  grossProfit: number;
  netProfit: number;
  profitMargin: number;        // % (0-100)
  roi: number;                 // % (0-100)
  totalCost: number;
  breakdown: {
    sourcePrice: number;
    marketplaceFee: number;
    paymentFee: number;
    shippingCost: number;
    packagingCost: number;
    advertisingCost: number;
    taxes: number;
    otherCosts: number;
  };
}

export class FinancialCalculationsService {
  // ✅ Fees por defecto basados en marketplaces reales
  private readonly defaultFees = {
    ebay: { marketplaceFee: 0.125, paymentFee: 0.029 },
    amazon: { marketplaceFee: 0.15, paymentFee: 0.029 },
    mercadolibre: { marketplaceFee: 0.11, paymentFee: 0.029 },
  } as const;

  private readonly defaultFixedCosts = {
    shippingCost: 5.99,
    packagingCost: 2.50,
    advertisingCost: 3.00,
  };

  /**
   * ✅ Q13: Calcular ganancia, margen y ROI de forma centralizada
   */
  calculateProfit(input: ProfitCalculationInput): ProfitCalculationResult {
    const {
      sourcePrice,
      targetPrice,
      sourceCurrency = 'USD',
      targetCurrency = 'USD',
      marketplace = 'ebay',
      fees = {},
    } = input;

    // Convertir sourcePrice a targetCurrency si es necesario
    let sourcePriceInTargetCurrency = sourcePrice;
    if (sourceCurrency !== targetCurrency) {
      try {
        sourcePriceInTargetCurrency = fx.convert(sourcePrice, sourceCurrency, targetCurrency);
      } catch (error) {
        // Si falla la conversión, usar sourcePrice sin convertir
        sourcePriceInTargetCurrency = sourcePrice;
      }
    }

    // Obtener fees del marketplace o usar los proporcionados
    const marketplaceFees = this.defaultFees[marketplace] || this.defaultFees.ebay;
    const marketplaceFeePct = fees.marketplaceFee ?? marketplaceFees.marketplaceFee;
    const paymentFeePct = fees.paymentFee ?? marketplaceFees.paymentFee;

    // Calcular costos
    const marketplaceFeeAmount = targetPrice * marketplaceFeePct;
    const paymentFeeAmount = targetPrice * paymentFeePct;
    const shippingCost = fees.shippingCost ?? this.defaultFixedCosts.shippingCost;
    const packagingCost = fees.packagingCost ?? this.defaultFixedCosts.packagingCost;
    const advertisingCost = fees.advertisingCost ?? this.defaultFixedCosts.advertisingCost;
    const taxes = targetPrice * (fees.taxesPct ?? 0);
    const otherCosts = fees.otherCosts ?? 0;

    const totalCost = sourcePriceInTargetCurrency + marketplaceFeeAmount + paymentFeeAmount +
                      shippingCost + packagingCost + advertisingCost + taxes + otherCosts;

    // Calcular ganancias
    const grossProfit = targetPrice - sourcePriceInTargetCurrency;
    const netProfit = targetPrice - totalCost;

    // Calcular márgenes y ROI
    const profitMargin = targetPrice > 0 ? (netProfit / targetPrice) * 100 : 0;
    const roi = sourcePriceInTargetCurrency > 0 ? (netProfit / sourcePriceInTargetCurrency) * 100 : 0;

    // ✅ Usar utilidad centralizada de redondeo
    const { roundMoney } = require('../utils/money.utils');
    
    return {
      grossProfit: roundMoney(grossProfit, targetCurrency),
      netProfit: roundMoney(netProfit, targetCurrency),
      profitMargin: Math.round(profitMargin * 100) / 100, // Porcentaje: 2 decimales siempre
      roi: Math.round(roi * 100) / 100, // Porcentaje: 2 decimales siempre
      totalCost: roundMoney(totalCost, targetCurrency),
      breakdown: {
        sourcePrice: roundMoney(sourcePriceInTargetCurrency, targetCurrency),
        marketplaceFee: roundMoney(marketplaceFeeAmount, targetCurrency),
        paymentFee: roundMoney(paymentFeeAmount, targetCurrency),
        shippingCost: roundMoney(shippingCost, targetCurrency),
        packagingCost: roundMoney(packagingCost, targetCurrency),
        advertisingCost: roundMoney(advertisingCost, targetCurrency),
        taxes: roundMoney(taxes, targetCurrency),
        otherCosts: roundMoney(otherCosts, targetCurrency),
      },
    };
  }

  /**
   * ✅ Q13: Calcular ROI de forma centralizada
   */
  calculateROI(investment: number, profit: number): number {
    if (investment <= 0) return 0;
    return Math.round((profit / investment) * 100 * 100) / 100;
  }

  /**
   * ✅ Q13: Calcular margen de forma centralizada
   */
  calculateMargin(salePrice: number, cost: number): number {
    if (salePrice <= 0) return 0;
    return Math.round(((salePrice - cost) / salePrice) * 100 * 100) / 100;
  }

  /**
   * ✅ Q13: Validar si un precio es rentable
   */
  isPriceProfitable(input: ProfitCalculationInput, minMargin: number = 20, minROI: number = 50): boolean {
    const result = this.calculateProfit(input);
    return result.profitMargin >= minMargin && result.roi >= minROI;
  }
}

export const financialCalculationsService = new FinancialCalculationsService();
