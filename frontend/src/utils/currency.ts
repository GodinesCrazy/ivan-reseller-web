/**
 * ✅ Utilidad Centralizada de Formateo de Moneda
 * 
 * Centraliza todo el formateo de monedas en el frontend para evitar inconsistencias.
 * Soporta múltiples monedas incluyendo CLP (sin decimales).
 */

export interface CurrencyFormatOptions {
  currency?: string;
  showSymbol?: boolean;
  showCode?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  locale?: string;
}

/**
 * Lista de monedas sin decimales (se redondean a enteros)
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'JPY', 'KRW', 'VND', 'IDR']);

/**
 * Símbolos de moneda por código
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  MXN: '$',
  BRL: 'R$',
  ARS: '$',
  CLP: '$',
  COP: '$',
  PEN: 'S/',
  CHF: 'CHF',
  CNY: '¥',
  KRW: '₩',
  HKD: 'HK$',
  INR: '₹',
  TRY: '₺',
  ZAR: 'R',
  VND: '₫',
  PHP: '₱',
  IDR: 'Rp',
  THB: '฿',
  AED: 'د.إ',
};

/**
 * Locales por código de moneda (para formateo nativo)
 */
const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CAD: 'en-CA',
  AUD: 'en-AU',
  MXN: 'es-MX',
  BRL: 'pt-BR',
  ARS: 'es-AR',
  CLP: 'es-CL',
  COP: 'es-CO',
  PEN: 'es-PE',
  CHF: 'de-CH',
  CNY: 'zh-CN',
  KRW: 'ko-KR',
  HKD: 'zh-HK',
  INR: 'en-IN',
  TRY: 'tr-TR',
  ZAR: 'en-ZA',
  VND: 'vi-VN',
  PHP: 'en-PH',
  IDR: 'id-ID',
  THB: 'th-TH',
  AED: 'ar-AE',
};

/**
 * Formatea un valor numérico como moneda
 * 
 * @param value - Valor numérico a formatear
 * @param options - Opciones de formateo
 * @returns String formateado (ej: "$1,234.56" o "$1.234" para CLP)
 * 
 * @example
 * formatCurrency(1234.56, { currency: 'USD' }) // "$1,234.56"
 * formatCurrency(1234.56, { currency: 'CLP' }) // "$1.235" (redondeado)
 * formatCurrency(1234.56, { currency: 'EUR', showCode: true }) // "€1,234.56 EUR"
 */
export function formatCurrency(
  value: number | string | null | undefined,
  options: CurrencyFormatOptions = {}
): string {
  // Validar entrada
  if (value === null || value === undefined || value === '') {
    return formatCurrency(0, options);
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (!isFinite(numValue)) {
    return formatCurrency(0, options);
  }

  const currency = (options.currency || 'USD').toUpperCase();
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency);

  // Determinar decimales
  const minFractionDigits = options.minimumFractionDigits !== undefined
    ? options.minimumFractionDigits
    : isZeroDecimal ? 0 : 2;

  const maxFractionDigits = options.maximumFractionDigits !== undefined
    ? options.maximumFractionDigits
    : isZeroDecimal ? 0 : 2;

  // Redondear si es moneda sin decimales
  const roundedValue = isZeroDecimal ? Math.round(numValue) : numValue;

  // Intentar usar Intl.NumberFormat si está disponible
  try {
    const locale = options.locale || CURRENCY_LOCALES[currency] || 'en-US';
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: maxFractionDigits,
    });

    let formatted = formatter.format(roundedValue);

    // Si showCode es false, remover el código de moneda (dejar solo símbolo)
    if (options.showCode === false && formatted.includes(currency)) {
      formatted = formatted.replace(` ${currency}`, '').replace(`${currency} `, '');
    }

    // Si showSymbol es false, remover símbolo
    if (options.showSymbol === false) {
      const symbol = CURRENCY_SYMBOLS[currency] || currency;
      formatted = formatted.replace(symbol, '').trim();
      if (options.showCode !== false) {
        formatted = `${formatted} ${currency}`;
      }
    }

    // Si showCode es true, asegurar que el código esté presente
    if (options.showCode === true && !formatted.includes(currency)) {
      formatted = `${formatted} ${currency}`;
    }

    return formatted;
  } catch (error) {
    // Fallback si Intl.NumberFormat falla
    return formatCurrencyFallback(roundedValue, currency, {
      showSymbol: options.showSymbol !== false,
      showCode: options.showCode === false ? false : undefined,
      minFractionDigits,
      maxFractionDigits,
    });
  }
}

/**
 * Formateo de fallback sin Intl.NumberFormat
 */
function formatCurrencyFallback(
  value: number,
  currency: string,
  options: {
    showSymbol?: boolean;
    showCode?: boolean | undefined;
    minFractionDigits: number;
    maxFractionDigits: number;
  }
): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency);

  // Formatear número
  let formattedNumber: string;
  if (isZeroDecimal) {
    formattedNumber = Math.round(value).toLocaleString('en-US');
  } else {
    formattedNumber = value.toLocaleString('en-US', {
      minimumFractionDigits: options.minFractionDigits,
      maximumFractionDigits: options.maxFractionDigits,
    });
  }

  // Construir resultado
  let result = '';

  if (options.showSymbol !== false) {
    result += symbol;
  }

  result += formattedNumber;

  if (options.showCode === true || (options.showCode === undefined && currency !== 'USD')) {
    result += ` ${currency}`;
  }

  return result;
}

/**
 * Formatea un valor como moneda simple (solo símbolo + número)
 * 
 * @example
 * formatCurrencySimple(1234.56, 'USD') // "$1,234.56"
 * formatCurrencySimple(1234.56, 'CLP') // "$1.235"
 */
export function formatCurrencySimple(
  value: number | string | null | undefined,
  currency: string = 'USD'
): string {
  return formatCurrency(value, {
    currency,
    showSymbol: true,
    showCode: false,
  });
}

/**
 * Formatea un valor como moneda con código
 * 
 * @example
 * formatCurrencyWithCode(1234.56, 'USD') // "$1,234.56 USD"
 * formatCurrencyWithCode(1234.56, 'CLP') // "$1.235 CLP"
 */
export function formatCurrencyWithCode(
  value: number | string | null | undefined,
  currency: string = 'USD'
): string {
  return formatCurrency(value, {
    currency,
    showSymbol: true,
    showCode: true,
  });
}

/**
 * Formatea un valor como moneda sin símbolo (solo número + código)
 * 
 * @example
 * formatCurrencyNumberOnly(1234.56, 'USD') // "1,234.56 USD"
 * formatCurrencyNumberOnly(1234.56, 'CLP') // "1.235 CLP"
 */
export function formatCurrencyNumberOnly(
  value: number | string | null | undefined,
  currency: string = 'USD'
): string {
  return formatCurrency(value, {
    currency,
    showSymbol: false,
    showCode: true,
  });
}

/**
 * Parsea un string formateado como moneda a número
 * 
 * @example
 * parseCurrency("$1,234.56") // 1234.56
 * parseCurrency("$1.234", "CLP") // 1234 (CLP usa punto como separador de miles)
 */
export function parseCurrency(
  value: string,
  currency: string = 'USD'
): number {
  if (!value || typeof value !== 'string') {
    return 0;
  }

  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());

  // Remover símbolos y códigos de moneda
  let cleaned = value
    .replace(/[^\d.,\-]/g, '') // Remover todo excepto dígitos, punto, coma y menos
    .trim();

  if (!cleaned) {
    return 0;
  }

  // Determinar separadores según formato
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let thousandSeparator: string | null = null;
  let decimalSeparator: string | null = null;

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // Formato europeo: 1.234,56
      thousandSeparator = '.';
      decimalSeparator = ',';
    } else {
      // Formato americano: 1,234.56
      thousandSeparator = ',';
      decimalSeparator = '.';
    }
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    if (decimals === 0 || decimals > 2) {
      thousandSeparator = ',';
    } else {
      decimalSeparator = ',';
    }
  } else if (lastDot > -1) {
    const decimals = cleaned.length - lastDot - 1;
    if (decimals === 0 || decimals > 2) {
      // Probablemente separador de miles (formato chileno: 1.234)
      thousandSeparator = '.';
    } else {
      decimalSeparator = '.';
    }
  }

  // Remover separador de miles
  if (thousandSeparator) {
    cleaned = cleaned.replace(new RegExp(`\\${thousandSeparator}`, 'g'), '');
  }

  // Convertir separador decimal a punto
  if (decimalSeparator && decimalSeparator !== '.') {
    cleaned = cleaned.replace(decimalSeparator, '.');
  }

  // Si es moneda sin decimales, remover decimales
  if (isZeroDecimal && cleaned.includes('.')) {
    cleaned = cleaned.split('.')[0];
  }

  const parsed = parseFloat(cleaned);
  return isFinite(parsed) ? parsed : 0;
}

/**
 * Convierte un valor de una moneda a otra usando una tasa de cambio directa.
 * 
 * @param value - Valor a convertir
 * @param rate - Tasa de cambio (1 unidad de moneda origen = X unidades de moneda destino)
 * @returns Valor convertido
 * 
 * @example
 * convertCurrency(100, 950) // 95000 (100 USD * 950 CLP/USD)
 */
export function convertCurrency(
  value: number,
  rate: number
): number {
  if (!isFinite(value) || !isFinite(rate)) return 0;
  return value * rate;
}

/**
 * Obtiene el símbolo de una moneda
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] || currency.toUpperCase();
}

/**
 * Verifica si una moneda no usa decimales
 */
export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
}

