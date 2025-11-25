/**
 * ✅ Utilidades Centralizadas para Manejo de Dinero
 * 
 * Centraliza redondeos, formateo y conversiones de dinero
 * para evitar inconsistencias en todo el sistema.
 */

import { Prisma } from '@prisma/client';
import { toNumber, roundDecimal } from './decimal.utils';

/**
 * Monedas que no usan decimales (se redondean a enteros)
 */
export const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'JPY', 'KRW', 'VND', 'IDR']);

/**
 * Redondea un valor monetario según la moneda
 * - Monedas sin decimales (CLP, JPY, etc.): redondea a entero
 * - Otras monedas: redondea a 2 decimales (centavos)
 * 
 * @param value - Valor a redondear (number, Decimal, o string)
 * @param currency - Código de moneda (ej: 'USD', 'CLP')
 * @returns Número redondeado
 * 
 * @warning Convierte Decimals a number (float), lo que puede causar pérdida de precisión
 * en operaciones financieras complejas. Para mayor precisión, usar roundMoneyDecimal.
 */
export function roundMoney(value: number | Prisma.Decimal | string, currency: string = 'USD'): number {
  const numValue = typeof value === 'number' ? value : toNumber(value);
  
  if (!isFinite(numValue)) {
    return 0;
  }

  const currencyCode = currency.toUpperCase();
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currencyCode);

  if (isZeroDecimal) {
    return Math.round(numValue);
  } else {
    return Math.round(numValue * 100) / 100;
  }
}

/**
 * Redondea un Decimal de Prisma según la moneda
 */
export function roundMoneyDecimal(
  value: Prisma.Decimal | number,
  currency: string = 'USD'
): Prisma.Decimal {
  return roundDecimal(value, currency);
}

/**
 * Formatea un valor monetario como string
 * - Monedas sin decimales: sin decimales
 * - Otras monedas: 2 decimales
 * 
 * @param value - Valor a formatear
 * @param currency - Código de moneda
 * @returns String formateado (ej: "1,234.56" o "1.235")
 */
export function formatMoney(
  value: number | Prisma.Decimal | string,
  currency: string = 'USD'
): string {
  const numValue = typeof value === 'number' ? value : toNumber(value);
  const rounded = roundMoney(numValue, currency);
  
  const currencyCode = currency.toUpperCase();
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currencyCode);

  if (isZeroDecimal) {
    return rounded.toLocaleString('en-US');
  } else {
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

/**
 * Formatea un valor monetario con símbolo de moneda
 * 
 * @param value - Valor a formatear
 * @param currency - Código de moneda
 * @param showCode - Si true, muestra código de moneda (ej: "USD")
 * @returns String formateado (ej: "$1,234.56" o "$1,234.56 USD")
 */
export function formatMoneyWithSymbol(
  value: number | Prisma.Decimal | string,
  currency: string = 'USD',
  showCode: boolean = false
): string {
  const formatted = formatMoney(value, currency);
  const symbol = getCurrencySymbol(currency);
  
  let result = `${symbol}${formatted}`;
  
  if (showCode) {
    result += ` ${currency.toUpperCase()}`;
  }
  
  return result;
}

/**
 * Obtiene el símbolo de una moneda
 */
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
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
  
  return symbols[currency.toUpperCase()] || currency.toUpperCase();
}

/**
 * Verifica si una moneda no usa decimales
 */
export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
}

/**
 * Suma valores monetarios con redondeo correcto
 * 
 * @param values - Array de valores a sumar
 * @param currency - Moneda para redondeo
 * @returns Suma redondeada
 */
export function sumMoney(
  values: Array<number | Prisma.Decimal | string>,
  currency: string = 'USD'
): number {
  const sum = values.reduce((acc: number, val) => {
    const num = typeof val === 'number' ? val : toNumber(val);
    return acc + (isFinite(num) ? num : 0);
  }, 0);
  
  return roundMoney(sum, currency);
}

/**
 * Calcula porcentaje de un valor monetario
 * 
 * @param value - Valor base
 * @param percentage - Porcentaje (0-100)
 * @param currency - Moneda para redondeo
 * @returns Valor calculado y redondeado
 */
export function calculatePercentage(
  value: number | Prisma.Decimal | string,
  percentage: number,
  currency: string = 'USD'
): number {
  const numValue = typeof value === 'number' ? value : toNumber(value);
  const result = (numValue * percentage) / 100;
  return roundMoney(result, currency);
}

