/**
 * Profitability Service - FASE 3: Evaluaciùn de Rentabilidad
 * 
 * Responsabilidad:
 * - Calcular todos los costos estimados
 * - Calcular precio de venta recomendado
 * - Calcular utilidad neta
 * - Decidir: publish / discard
 * 
 * Usa estimaciones conservadoras si faltan datos.
 */

import { CostCalculatorService } from '../../services/cost-calculator.service';
import logger from '../../config/logger';
import type { ProductCandidate } from '../aliexpress/aliexpress-search.service';

export interface CostBreakdown {
  productCost: number; // Precio base de AliExpress
  shippingCost: number; // Costo de envùo (estimado si no disponible)
  marketplaceFee: number; // Fee del marketplace (% del precio de venta)
  paymentProcessingFee: number; // Fee de procesamiento de pago (% del precio de venta)
  taxesAndDuties: number; // Impuestos y aranceles estimados
  operationalBuffer: number; // Margen de seguridad
  totalCost: number; // Costo total
}

export interface ProfitabilityEvaluation {
  productId: string;
  decision: 'publish' | 'discard';
  reason: string;
  salePrice: number;
  estimatedProfit: number;
  profitMargin: number; // Porcentaje (0-100)
  costBreakdown: CostBreakdown;
  evaluatedAt: Date;
}

export interface ProfitabilityConfig {
  marketplace?: 'ebay' | 'amazon' | 'mercadolibre';
  targetCountry?: string; // Cùdigo de paùs (US, ES, MX, CL, etc.)
  desiredMargin?: number; // Margen deseado (default: 0.25 = 25%)
  minMargin?: number; // Margen mùnimo para publicar (default: 0.15 = 15%)
  marketplaceFeePercent?: number; // Override fee del marketplace (default: segùn marketplace)
  paymentFeePercent?: number; // Override fee de pago (default: 0.029 = 2.9%)
  taxRate?: number; // Tasa de impuestos estimada (default: segùn paùs)
  operationalBufferPercent?: number; // Buffer operacional (default: 0.05 = 5%)
  shippingEstimate?: number; // Estimaciùn de envùo si no disponible (default: segùn paùs)
}

/**
 * Configuraciùn por paùs para estimaciones
 */
const COUNTRY_CONFIG: Record<string, {
  taxRate: number; // IVA/impuestos (%)
  dutyRate: number; // Aranceles (%)
  shippingEstimate: number; // Estimaciùn de envùo en USD
}> = {
  US: { taxRate: 0, dutyRate: 0, shippingEstimate: 5.0 },
  ES: { taxRate: 0.21, dutyRate: 0, shippingEstimate: 8.0 }, // 21% IVA
  MX: { taxRate: 0.16, dutyRate: 0.05, shippingEstimate: 7.0 }, // 16% IVA + 5% arancel
  CL: { taxRate: 0.19, dutyRate: 0.06, shippingEstimate: 10.0 }, // 19% IVA + 6% arancel
  BR: { taxRate: 0.17, dutyRate: 0.10, shippingEstimate: 12.0 }, // 17% ICMS + 10% arancel
  UK: { taxRate: 0.20, dutyRate: 0, shippingEstimate: 6.0 }, // 20% VAT
  DE: { taxRate: 0.19, dutyRate: 0, shippingEstimate: 7.0 }, // 19% VAT
};

export class ProfitabilityService {
  private costCalculator: CostCalculatorService;

  constructor() {
    this.costCalculator = new CostCalculatorService();
  }

  /**
   * Evaluar rentabilidad de un producto candidato
   */
  async evaluateProduct(
    candidate: ProductCandidate,
    config: ProfitabilityConfig = {}
  ): Promise<ProfitabilityEvaluation> {
    console.log('[PROFITABILITY] Evaluating product:', candidate.productId);
    logger.info('[Profitability] Evaluando producto', {
      productId: candidate.productId,
      basePrice: candidate.basePrice,
      currency: candidate.currency,
      sourceKeyword: candidate.sourceKeyword,
      trendScore: candidate.trendScore,
      priority: candidate.priority,
    });

    try {
      // 1. Calcular costos
      const costBreakdown = this.calculateCosts(candidate, config);
      console.log('[PROFITABILITY] Cost breakdown:', {
        productCost: costBreakdown.productCost,
        shippingCost: costBreakdown.shippingCost,
        totalCost: costBreakdown.totalCost,
      });

      // 2. Calcular precio de venta recomendado
      const salePrice = this.calculateSalePrice(costBreakdown, config);
      console.log('[PROFITABILITY] Sale price calculated:', salePrice);

      // 3. Calcular utilidad
      const estimatedProfit = salePrice - costBreakdown.totalCost;
      const profitMargin = salePrice > 0 ? (estimatedProfit / salePrice) * 100 : 0;

      // 4. Tomar decisiùn
      const decision = this.makeDecision(candidate, estimatedProfit, profitMargin, config);
      const reason = this.getDecisionReason(candidate, estimatedProfit, profitMargin, config, decision);

      console.log('[PROFITABILITY] Decision made:', decision, reason);

      logger.info('[Profitability] Evaluaciùn completada', {
        productId: candidate.productId,
        decision,
        reason,
        salePrice,
        estimatedProfit,
        profitMargin: profitMargin.toFixed(2) + '%',
      });

      return {
        productId: candidate.productId,
        decision,
        reason,
        salePrice,
        estimatedProfit,
        profitMargin,
        costBreakdown,
        evaluatedAt: new Date(),
      };

    } catch (error: any) {
      logger.error('[Profitability] Error evaluando producto', {
        productId: candidate.productId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Calcular todos los costos
   */
  private calculateCosts(
    candidate: ProductCandidate,
    config: ProfitabilityConfig
  ): CostBreakdown {
    const marketplace = config.marketplace || 'ebay';
    const targetCountry = config.targetCountry || 'US';
    const countryConfig = COUNTRY_CONFIG[targetCountry] || COUNTRY_CONFIG.US;

    // 1. Costo del producto
    const productCost = candidate.basePrice;

    // 2. Costo de envùo
    let shippingCost = candidate.shippingCost || null;
    if (shippingCost === null) {
      // Estimar envùo si no estù disponible
      shippingCost = config.shippingEstimate || countryConfig.shippingEstimate;
      console.log('[PROFITABILITY] Shipping cost estimated:', shippingCost);
    }

    // 3. Marketplace fee (usar cost-calculator para obtener defaults)
    const marketplaceFeePercent = config.marketplaceFeePercent;
    // El cost-calculator usa defaults: ebay 12.5%, amazon 15%, mercadolibre 11%
    const defaultMarketplaceFee = marketplace === 'ebay' ? 0.125 : marketplace === 'amazon' ? 0.15 : 0.11;
    const marketplaceFeeRate = marketplaceFeePercent !== undefined 
      ? marketplaceFeePercent 
      : defaultMarketplaceFee;

    // 4. Payment processing fee
    const paymentFeePercent = config.paymentFeePercent || 0.029; // 2.9% default

    // 5. Impuestos y aranceles
    const taxRate = config.taxRate !== undefined 
      ? config.taxRate 
      : countryConfig.taxRate;
    const dutyRate = countryConfig.dutyRate;

    // Calcular impuestos sobre el precio de venta estimado (conservador)
    // Usamos un precio de venta estimado inicial para calcular impuestos
    const estimatedSalePrice = productCost * 2; // Estimaciùn conservadora
    const taxesAndDuties = (estimatedSalePrice * taxRate) + (productCost * dutyRate);

    // 6. Buffer operacional
    const operationalBufferPercent = config.operationalBufferPercent || 0.05; // 5% default
    const operationalBuffer = productCost * operationalBufferPercent;

    // 7. Calcular costo total (sin fees de marketplace/pago aùn, se calcularùn sobre salePrice)
    // Por ahora, calculamos un costo base
    const baseTotalCost = productCost + shippingCost + taxesAndDuties + operationalBuffer;

    // Nota: marketplaceFee y paymentFee se calcularùn sobre el precio de venta final
    // Por ahora los dejamos en 0 en el breakdown base, se calcularùn despuùs

    return {
      productCost,
      shippingCost,
      marketplaceFee: 0, // Se calcularù sobre salePrice
      paymentProcessingFee: 0, // Se calcularù sobre salePrice
      taxesAndDuties,
      operationalBuffer,
      totalCost: baseTotalCost, // Costo base sin fees de marketplace
    };
  }

  /**
   * Calcular precio de venta recomendado
   */
  private calculateSalePrice(
    costBreakdown: CostBreakdown,
    config: ProfitabilityConfig
  ): number {
    const desiredMargin = config.desiredMargin || 0.25; // 25% default
    const marketplace = config.marketplace || 'ebay';
    const marketplaceFeeRate = config.marketplaceFeePercent !== undefined
      ? config.marketplaceFeePercent
      : marketplace === 'ebay' ? 0.125 : marketplace === 'amazon' ? 0.15 : 0.11;
    const paymentFeeRate = config.paymentFeePercent || 0.029;

    // Fùrmula: salePrice = totalCost / (1 - desiredMargin - marketplaceFee - paymentFee)
    // Donde totalCost incluye: productCost + shipping + taxes + buffer + (fees sobre salePrice)
    // Resolvemos iterativamente o usamos fùrmula:
    // salePrice = (baseCost) / (1 - margin - marketplaceFee - paymentFee)

    // Calcular costo base sin fees de marketplace/pago
    const baseCost = costBreakdown.productCost + costBreakdown.shippingCost + 
                     costBreakdown.taxesAndDuties + costBreakdown.operationalBuffer;
    const totalFeeRate = marketplaceFeeRate + paymentFeeRate;
    const denominator = 1 - desiredMargin - totalFeeRate;

    if (denominator <= 0) {
      // Si el margen + fees superan 100%, usar margen mùnimo
      const minDenominator = 1 - 0.10 - totalFeeRate; // 10% margen mùnimo
      return baseCost / Math.max(minDenominator, 0.5); // Mùnimo 50% para evitar divisiùn por 0
    }

    const salePrice = baseCost / denominator;

    // Redondear a 2 decimales
    return Math.round(salePrice * 100) / 100;
  }

  /**
   * Tomar decisiùn automùtica
   */
  private makeDecision(
    candidate: ProductCandidate,
    estimatedProfit: number,
    profitMargin: number,
    config: ProfitabilityConfig
  ): 'publish' | 'discard' {
    const minMargin = (config.minMargin || 0.15) * 100; // Convertir a porcentaje
    const minProfit = 1.0; // Mùnimo $1 de ganancia

    // Regla 1: Margen mùnimo
    if (profitMargin < minMargin) {
      return 'discard';
    }

    // Regla 2: Ganancia mùnima
    if (estimatedProfit < minProfit) {
      return 'discard';
    }

    // Regla 3: Tendencia declining
    // Nota: candidate no tiene campo 'trend', pero podemos usar trendScore
    // Si trendScore es muy bajo, podrùa indicar tendencia declining
    if (candidate.trendScore < 30) {
      return 'discard';
    }

    // Regla 4: Priority high + margen aceptable ? publish
    if (candidate.priority === 'high' && profitMargin >= minMargin) {
      return 'publish';
    }

    // Regla 5: Margen bueno (>= 20%) ? publish
    if (profitMargin >= 20) {
      return 'publish';
    }

    // Regla 6: Margen aceptable (>= minMargin) pero no excelente ? publish (conservador)
    if (profitMargin >= minMargin) {
      return 'publish';
    }

    // Por defecto: discard
    return 'discard';
  }

  /**
   * Obtener razùn de la decisiùn
   */
  private getDecisionReason(
    candidate: ProductCandidate,
    estimatedProfit: number,
    profitMargin: number,
    config: ProfitabilityConfig,
    decision: 'publish' | 'discard'
  ): string {
    const minMargin = (config.minMargin || 0.15) * 100;

    if (decision === 'discard') {
      if (profitMargin < minMargin) {
        return `Margen insuficiente (${profitMargin.toFixed(2)}% < ${minMargin}%)`;
      }
      if (estimatedProfit < 1.0) {
        return `Ganancia insuficiente ($${estimatedProfit.toFixed(2)} < $1.00)`;
      }
      if (candidate.trendScore < 30) {
        return `Tendencia baja (score: ${candidate.trendScore})`;
      }
      return 'No cumple criterios de rentabilidad';
    }

    // decision === 'publish'
    if (candidate.priority === 'high' && profitMargin >= minMargin) {
      return `Alta prioridad con margen aceptable (${profitMargin.toFixed(2)}%)`;
    }
    if (profitMargin >= 20) {
      return `Margen excelente (${profitMargin.toFixed(2)}%)`;
    }
    return `Margen aceptable (${profitMargin.toFixed(2)}%)`;
  }

  /**
   * Recalcular costos con precio de venta final (para actualizar breakdown)
   */
  recalculateCostsWithSalePrice(
    costBreakdown: CostBreakdown,
    salePrice: number,
    config: ProfitabilityConfig
  ): CostBreakdown {
    const marketplace = config.marketplace || 'ebay';
    const marketplaceFeeRate = config.marketplaceFeePercent !== undefined
      ? config.marketplaceFeePercent
      : marketplace === 'ebay' ? 0.125 : marketplace === 'amazon' ? 0.15 : 0.11;
    const paymentFeeRate = config.paymentFeePercent || 0.029;

    const marketplaceFee = salePrice * marketplaceFeeRate;
    const paymentFee = salePrice * paymentFeeRate;

    // Recalcular impuestos sobre precio de venta real
    const targetCountry = config.targetCountry || 'US';
    const countryConfig = COUNTRY_CONFIG[targetCountry] || COUNTRY_CONFIG.US;
    const taxRate = config.taxRate !== undefined ? config.taxRate : countryConfig.taxRate;
    const dutyRate = countryConfig.dutyRate;
    const taxesAndDuties = (salePrice * taxRate) + (costBreakdown.productCost * dutyRate);

    return {
      ...costBreakdown,
      marketplaceFee,
      paymentProcessingFee: paymentFee,
      taxesAndDuties,
      totalCost: costBreakdown.productCost + costBreakdown.shippingCost + taxesAndDuties + 
                 costBreakdown.operationalBuffer + marketplaceFee + paymentFee,
    };
  }
}

export const profitabilityService = new ProfitabilityService();
