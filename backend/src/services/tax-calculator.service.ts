/**
 * Tax Calculator Service
 * Calcula impuestos de importación (IVA/aranceles) por país
 */

export interface TaxConfig {
  vatRate: number; // IVA como decimal (ej: 0.19 para 19%)
  importDuty?: number; // Arancel como decimal (opcional)
  currency: string; // Moneda del país
}

export interface TaxCalculationResult {
  vatAmount: number;
  importDutyAmount: number;
  totalTax: number;
  subtotal: number; // Subtotal antes de impuestos (producto + envío)
  totalWithTax: number; // Total con impuestos
}

class TaxCalculatorService {
  // Configuración de impuestos por país
  // Formato: código ISO del país (CL, ES, US, etc.)
  private taxConfigs: Record<string, TaxConfig> = {
    // Chile
    CL: {
      vatRate: 0.19, // IVA 19%
      importDuty: 0.06, // Arancel promedio 6%
      currency: 'CLP'
    },
    // España
    ES: {
      vatRate: 0.21, // IVA 21%
      importDuty: 0.0, // Sin arancel dentro de UE
      currency: 'EUR'
    },
    // Estados Unidos
    US: {
      vatRate: 0.0, // Sin IVA federal
      importDuty: 0.0, // Generalmente sin arancel para productos < $800
      currency: 'USD'
    },
    // México
    MX: {
      vatRate: 0.16, // IVA 16%
      importDuty: 0.0, // Varía por producto
      currency: 'MXN'
    },
    // Brasil
    BR: {
      vatRate: 0.17, // ICMS promedio 17%
      importDuty: 0.0, // Varía por producto
      currency: 'BRL'
    },
    // Argentina
    AR: {
      vatRate: 0.21, // IVA 21%
      importDuty: 0.0, // Varía por producto
      currency: 'ARS'
    },
    // Colombia
    CO: {
      vatRate: 0.19, // IVA 19%
      importDuty: 0.0, // Varía por producto
      currency: 'COP'
    },
    // Perú
    PE: {
      vatRate: 0.18, // IGV 18%
      importDuty: 0.0, // Varía por producto
      currency: 'PEN'
    },
    // Reino Unido
    UK: {
      vatRate: 0.20, // VAT 20%
      importDuty: 0.0, // Varía por producto
      currency: 'GBP'
    },
    // Alemania
    DE: {
      vatRate: 0.19, // VAT 19%
      importDuty: 0.0, // Sin arancel dentro de UE
      currency: 'EUR'
    },
    // Francia
    FR: {
      vatRate: 0.20, // VAT 20%
      importDuty: 0.0, // Sin arancel dentro de UE
      currency: 'EUR'
    },
    // Italia
    IT: {
      vatRate: 0.22, // VAT 22%
      importDuty: 0.0, // Sin arancel dentro de UE
      currency: 'EUR'
    },
    // ✅ NUEVO: Australia
    AU: {
      vatRate: 0.10, // GST (Goods and Services Tax) 10%
      importDuty: 0.0, // Generalmente sin arancel para productos < AUD 1,000
      currency: 'AUD'
    },
    // ✅ NUEVO: Canadá
    CA: {
      vatRate: 0.13, // HST (Harmonized Sales Tax) promedio 13% (varía por provincia: 5-15%)
      importDuty: 0.0, // Generalmente sin arancel para productos < CAD 150
      currency: 'CAD'
    },
    // ✅ NUEVO: Nueva Zelanda
    NZ: {
      vatRate: 0.15, // GST 15%
      importDuty: 0.0, // Generalmente sin arancel para productos < NZD 1,000
      currency: 'NZD'
    },
    // ✅ NUEVO: Japón
    JP: {
      vatRate: 0.10, // Consumption Tax 10%
      importDuty: 0.0, // Varía por producto
      currency: 'JPY'
    },
    // ✅ NUEVO: Corea del Sur
    KR: {
      vatRate: 0.10, // VAT 10%
      importDuty: 0.0, // Varía por producto
      currency: 'KRW'
    },
    // ✅ NUEVO: Singapur
    SG: {
      vatRate: 0.07, // GST 7%
      importDuty: 0.0, // Generalmente sin arancel
      currency: 'SGD'
    },
    // ✅ NUEVO: India
    IN: {
      vatRate: 0.18, // GST 18% (promedio, varía por producto)
      importDuty: 0.0, // Varía significativamente por producto
      currency: 'INR'
    },
    // ✅ NUEVO: Sudáfrica
    ZA: {
      vatRate: 0.15, // VAT 15%
      importDuty: 0.0, // Varía por producto
      currency: 'ZAR'
    }
  };

  /**
   * Obtener configuración de impuestos para un país
   */
  getTaxConfig(countryCode: string): TaxConfig {
    const code = countryCode.toUpperCase();
    const config = this.taxConfigs[code];
    
    if (!config) {
      // Configuración por defecto (sin impuestos)
      return {
        vatRate: 0.0,
        importDuty: 0.0,
        currency: 'USD'
      };
    }
    
    return config;
  }

  /**
   * Calcular impuestos de importación
   * @param subtotal - Subtotal antes de impuestos (producto + envío)
   * @param countryCode - Código ISO del país (CL, ES, US, etc.)
   * @returns Resultado del cálculo de impuestos
   */
  calculateTax(
    subtotal: number,
    countryCode: string
  ): TaxCalculationResult {
    const config = this.getTaxConfig(countryCode);
    
    // Calcular arancel sobre el subtotal
    const importDutyAmount = config.importDuty 
      ? subtotal * config.importDuty 
      : 0;
    
    // Calcular IVA sobre subtotal + arancel
    const subtotalWithDuty = subtotal + importDutyAmount;
    const vatAmount = subtotalWithDuty * config.vatRate;
    
    const totalTax = importDutyAmount + vatAmount;
    const totalWithTax = subtotal + totalTax;
    
    return {
      vatAmount: Math.round(vatAmount * 100) / 100,
      importDutyAmount: Math.round(importDutyAmount * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      totalWithTax: Math.round(totalWithTax * 100) / 100
    };
  }

  /**
   * Calcular impuestos con desglose detallado
   */
  calculateTaxDetailed(
    productCost: number,
    shippingCost: number,
    countryCode: string
  ): TaxCalculationResult & {
    productCost: number;
    shippingCost: number;
    breakdown: {
      productCost: number;
      shippingCost: number;
      importDuty: number;
      vat: number;
      totalTax: number;
      total: number;
    };
  } {
    const subtotal = productCost + shippingCost;
    const taxResult = this.calculateTax(subtotal, countryCode);
    
    return {
      ...taxResult,
      productCost: Math.round(productCost * 100) / 100,
      shippingCost: Math.round(shippingCost * 100) / 100,
      breakdown: {
        productCost: Math.round(productCost * 100) / 100,
        shippingCost: Math.round(shippingCost * 100) / 100,
        importDuty: taxResult.importDutyAmount,
        vat: taxResult.vatAmount,
        totalTax: taxResult.totalTax,
        total: taxResult.totalWithTax
      }
    };
  }

  /**
   * Actualizar configuración de impuestos para un país
   */
  updateTaxConfig(countryCode: string, config: Partial<TaxConfig>): void {
    const code = countryCode.toUpperCase();
    const existing = this.taxConfigs[code] || {
      vatRate: 0.0,
      importDuty: 0.0,
      currency: 'USD'
    };
    
    this.taxConfigs[code] = {
      ...existing,
      ...config
    };
  }

  /**
   * Obtener todos los países configurados
   */
  getAvailableCountries(): string[] {
    return Object.keys(this.taxConfigs);
  }
}

export const taxCalculatorService = new TaxCalculatorService();
export default taxCalculatorService;

