/**
 * ✅ Utilidades para trabajar con Decimal de Prisma
 * 
 * Convierte entre Prisma.Decimal y number de forma segura
 */

import { Prisma } from '@prisma/client';

/**
 * Convierte un valor (Decimal, number, string) a number
 * Útil para trabajar con campos Decimal de Prisma
 */
export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    // ✅ Validar que el número sea finito y no NaN
    if (!isFinite(value) || isNaN(value)) {
      return 0;
    }
    // ✅ Limitar valores extremos para prevenir problemas de serialización
    if (Math.abs(value) > 1e15) {
      return value > 0 ? 1e15 : -1e15;
    }
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isFinite(parsed) || isNaN(parsed)) {
      return 0;
    }
    if (Math.abs(parsed) > 1e15) {
      return parsed > 0 ? 1e15 : -1e15;
    }
    return parsed;
  }

  // Es Prisma.Decimal
  try {
    const num = value.toNumber();
    // ✅ Validar resultado de toNumber()
    if (!isFinite(num) || isNaN(num)) {
      return 0;
    }
    // ✅ Limitar valores extremos
    if (Math.abs(num) > 1e15) {
      return num > 0 ? 1e15 : -1e15;
    }
    return num;
  } catch (error) {
    // Si falla, intentar como string
    try {
      const str = value.toString();
      const parsed = parseFloat(str);
      if (!isFinite(parsed) || isNaN(parsed)) {
        return 0;
      }
      if (Math.abs(parsed) > 1e15) {
        return parsed > 0 ? 1e15 : -1e15;
      }
      return parsed;
    } catch {
      return 0;
    }
  }
}

/**
 * Convierte un valor a Prisma.Decimal
 */
export function toDecimal(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }

  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (typeof value === 'number') {
    return new Prisma.Decimal(value);
  }

  if (typeof value === 'string') {
    return new Prisma.Decimal(value);
  }

  return new Prisma.Decimal(0);
}

/**
 * Redondea un Decimal a 2 decimales (o entero si es moneda sin decimales)
 */
export function roundDecimal(
  value: Prisma.Decimal | number,
  currency?: string
): Prisma.Decimal {
  const numValue = value instanceof Prisma.Decimal ? value.toNumber() : value;
  
  if (!isFinite(numValue)) {
    return new Prisma.Decimal(0);
  }

  const zeroDecimalCurrencies = new Set(['CLP', 'JPY', 'KRW', 'VND', 'IDR']);
  const currencyCode = (currency || '').toUpperCase();
  const isZeroDecimal = zeroDecimalCurrencies.has(currencyCode);

  if (isZeroDecimal) {
    return new Prisma.Decimal(Math.round(numValue));
  } else {
    return new Prisma.Decimal(Math.round(numValue * 100) / 100);
  }
}

