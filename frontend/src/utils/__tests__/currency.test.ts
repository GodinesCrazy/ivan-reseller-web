/**
 * ✅ Tests para utilidades de formateo de moneda en frontend
 */

import {
  formatCurrency,
  formatCurrencySimple,
  formatCurrencyWithCode,
  formatCurrencyNumberOnly,
  parseCurrency,
  getCurrencySymbol,
  isZeroDecimalCurrency,
} from '../currency';

describe('currency utils', () => {
  describe('formatCurrencySimple', () => {
    it('should format USD with $ symbol', () => {
      expect(formatCurrencySimple(1234.56, 'USD')).toContain('$');
      expect(formatCurrencySimple(1234.56, 'USD')).toContain('1,234.56');
    });

    it('should format CLP without decimals', () => {
      const formatted = formatCurrencySimple(1234.56, 'CLP');
      expect(formatted).toContain('$');
      expect(formatted).not.toContain('.56');
      expect(formatted).toContain('1,235'); // Rounded
    });

    it('should handle zero', () => {
      expect(formatCurrencySimple(0, 'USD')).toContain('$0');
      expect(formatCurrencySimple(0, 'CLP')).toContain('$0');
    });

    it('should handle null/undefined', () => {
      expect(formatCurrencySimple(null, 'USD')).toContain('$0');
      expect(formatCurrencySimple(undefined, 'USD')).toContain('$0');
    });
  });

  describe('formatCurrencyWithCode', () => {
    it('should include currency code', () => {
      const formatted = formatCurrencyWithCode(1234.56, 'USD');
      expect(formatted).toContain('USD');
      expect(formatted).toContain('$');
    });

    it('should include CLP code', () => {
      const formatted = formatCurrencyWithCode(1234.56, 'CLP');
      expect(formatted).toContain('CLP');
      expect(formatted).toContain('$');
    });
  });

  describe('formatCurrencyNumberOnly', () => {
    it('should not include symbol', () => {
      const formatted = formatCurrencyNumberOnly(1234.56, 'USD');
      expect(formatted).not.toContain('$');
      expect(formatted).toContain('USD');
      expect(formatted).toContain('1,234.56');
    });
  });

  describe('parseCurrency', () => {
    it('should parse USD format', () => {
      expect(parseCurrency('$1,234.56', 'USD')).toBe(1234.56);
      expect(parseCurrency('$100', 'USD')).toBe(100);
      expect(parseCurrency('1,234.56', 'USD')).toBe(1234.56);
    });

    it('should parse CLP format (no decimals)', () => {
      expect(parseCurrency('$1.234', 'CLP')).toBe(1234);
      expect(parseCurrency('$1,234', 'CLP')).toBe(1234);
    });

    it('should handle empty string', () => {
      expect(parseCurrency('', 'USD')).toBe(0);
    });

    it('should handle invalid input', () => {
      expect(parseCurrency('abc', 'USD')).toBe(0);
    });
  });

  describe('getCurrencySymbol', () => {
    it('should return correct symbols', () => {
      expect(getCurrencySymbol('USD')).toBe('$');
      expect(getCurrencySymbol('EUR')).toBe('€');
      expect(getCurrencySymbol('GBP')).toBe('£');
      expect(getCurrencySymbol('CLP')).toBe('$');
    });

    it('should return currency code for unknown currencies', () => {
      expect(getCurrencySymbol('XXX')).toBe('XXX');
    });
  });

  describe('isZeroDecimalCurrency', () => {
    it('should return true for zero-decimal currencies', () => {
      expect(isZeroDecimalCurrency('CLP')).toBe(true);
      expect(isZeroDecimalCurrency('JPY')).toBe(true);
      expect(isZeroDecimalCurrency('KRW')).toBe(true);
    });

    it('should return false for decimal currencies', () => {
      expect(isZeroDecimalCurrency('USD')).toBe(false);
      expect(isZeroDecimalCurrency('EUR')).toBe(false);
    });
  });
});

