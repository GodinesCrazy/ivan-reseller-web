/**
 * ✅ Tests para utilidades de manejo de dinero
 */

import { roundMoney, formatMoney, formatMoneyWithSymbol, sumMoney, calculatePercentage, isZeroDecimalCurrency } from '../money.utils';
import { Prisma } from '@prisma/client';

describe('money.utils', () => {
  describe('roundMoney', () => {
    it('should round USD to 2 decimal places', () => {
      expect(roundMoney(123.456, 'USD')).toBe(123.46);
      expect(roundMoney(123.451, 'USD')).toBe(123.45);
      expect(roundMoney(100, 'USD')).toBe(100);
    });

    it('should round CLP to integer (no decimals)', () => {
      expect(roundMoney(123.456, 'CLP')).toBe(123);
      expect(roundMoney(123.9, 'CLP')).toBe(124);
      expect(roundMoney(100.1, 'CLP')).toBe(100);
    });

    it('should round JPY to integer (no decimals)', () => {
      expect(roundMoney(123.456, 'JPY')).toBe(123);
      expect(roundMoney(123.9, 'JPY')).toBe(124);
    });

    it('should handle zero', () => {
      expect(roundMoney(0, 'USD')).toBe(0);
      expect(roundMoney(0, 'CLP')).toBe(0);
    });

    it('should handle negative values', () => {
      expect(roundMoney(-123.456, 'USD')).toBe(-123.46);
      expect(roundMoney(-123.456, 'CLP')).toBe(-123);
    });

    it('should handle Prisma.Decimal', () => {
      const decimal = new Prisma.Decimal('123.456');
      expect(roundMoney(decimal, 'USD')).toBe(123.46);
      expect(roundMoney(decimal, 'CLP')).toBe(123);
    });
  });

  describe('formatMoney', () => {
    it('should format USD with 2 decimals', () => {
      expect(formatMoney(1234.56, 'USD')).toBe('1,234.56');
      expect(formatMoney(100, 'USD')).toBe('100.00');
      expect(formatMoney(0, 'USD')).toBe('0.00');
    });

    it('should format CLP without decimals', () => {
      expect(formatMoney(1234.56, 'CLP')).toBe('1,235');
      expect(formatMoney(100, 'CLP')).toBe('100');
      expect(formatMoney(0, 'CLP')).toBe('0');
    });

    it('should handle large numbers', () => {
      expect(formatMoney(1234567.89, 'USD')).toBe('1,234,567.89');
      expect(formatMoney(1234567.89, 'CLP')).toBe('1,234,568');
    });
  });

  describe('formatMoneyWithSymbol', () => {
    it('should format USD with $ symbol', () => {
      expect(formatMoneyWithSymbol(1234.56, 'USD')).toBe('$1,234.56');
      expect(formatMoneyWithSymbol(100, 'USD')).toBe('$100.00');
    });

    it('should format CLP with $ symbol (no decimals)', () => {
      expect(formatMoneyWithSymbol(1234.56, 'CLP')).toBe('$1,235');
      expect(formatMoneyWithSymbol(100, 'CLP')).toBe('$100');
    });

    it('should format EUR with € symbol', () => {
      expect(formatMoneyWithSymbol(1234.56, 'EUR')).toBe('€1,234.56');
    });

    it('should include currency code when showCode is true', () => {
      expect(formatMoneyWithSymbol(1234.56, 'USD', true)).toBe('$1,234.56 USD');
      expect(formatMoneyWithSymbol(1234.56, 'CLP', true)).toBe('$1,235 CLP');
    });
  });

  describe('sumMoney', () => {
    it('should sum multiple USD values', () => {
      expect(sumMoney([10.50, 20.25, 30.75], 'USD')).toBe(61.50);
      expect(sumMoney([100, 200, 300], 'USD')).toBe(600);
    });

    it('should sum CLP values and round to integer', () => {
      expect(sumMoney([10.5, 20.3, 30.7], 'CLP')).toBe(62);
      expect(sumMoney([100.9, 200.1], 'CLP')).toBe(301);
    });

    it('should handle empty array', () => {
      expect(sumMoney([], 'USD')).toBe(0);
      expect(sumMoney([], 'CLP')).toBe(0);
    });

    it('should handle Prisma.Decimal values', () => {
      const values = [
        new Prisma.Decimal('10.50'),
        new Prisma.Decimal('20.25'),
        new Prisma.Decimal('30.75')
      ];
      expect(sumMoney(values, 'USD')).toBe(61.50);
    });
  });

  describe('calculatePercentage', () => {
    it('should calculate 20% of 100 USD', () => {
      expect(calculatePercentage(100, 20, 'USD')).toBe(20);
      expect(calculatePercentage(100, 20, 'USD')).toBe(20.00);
    });

    it('should calculate 10% of 1000 CLP and round to integer', () => {
      expect(calculatePercentage(1000, 10, 'CLP')).toBe(100);
    });

    it('should handle 0%', () => {
      expect(calculatePercentage(100, 0, 'USD')).toBe(0);
    });

    it('should handle 100%', () => {
      expect(calculatePercentage(100, 100, 'USD')).toBe(100);
    });
  });

  describe('isZeroDecimalCurrency', () => {
    it('should return true for CLP', () => {
      expect(isZeroDecimalCurrency('CLP')).toBe(true);
      expect(isZeroDecimalCurrency('clp')).toBe(true);
    });

    it('should return true for JPY', () => {
      expect(isZeroDecimalCurrency('JPY')).toBe(true);
    });

    it('should return false for USD', () => {
      expect(isZeroDecimalCurrency('USD')).toBe(false);
    });

    it('should return false for EUR', () => {
      expect(isZeroDecimalCurrency('EUR')).toBe(false);
    });
  });
});

