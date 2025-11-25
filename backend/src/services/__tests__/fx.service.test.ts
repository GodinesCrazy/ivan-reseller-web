import { Prisma } from '@prisma/client';

// ===================================
// MOCKS - DEBEN IR PRIMERO
// ===================================

// Mock de axios para evitar llamadas HTTP reales
jest.mock('axios', () => ({
    get: jest.fn(),
}));

// Mock de logger
jest.mock('../../config/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock de redis
jest.mock('../../config/redis', () => ({
    redis: {
        get: jest.fn().mockResolvedValue(null),
        setex: jest.fn().mockResolvedValue('OK'),
    },
    isRedisAvailable: false,
}));

// ===================================
// IMPORTS - DESPUÉS DE MOCKS
// ===================================

import fxService from '../fx.service';

describe('FXService', () => {
    beforeEach(() => {
        // Limpiar caché
        (fxService as any).conversionCache.clear();

        // Establecer tasas de prueba
        (fxService as any).rates = {
            USD: 1,
            CLP: 950,
            EUR: 0.92,
            GBP: 0.79,
            JPY: 150,
        };
    });

    describe('convert() - Conversión de monedas', () => {
        it('debería convertir number a number (USD -> CLP)', () => {
            const result = fxService.convert(100, 'USD', 'CLP');
            expect(result).toBe(95000);
        });

        it('debería convertir Prisma.Decimal a number', () => {
            const decimalAmount = new Prisma.Decimal(100);
            const result = fxService.convert(decimalAmount, 'USD', 'CLP');
            expect(result).toBe(95000);
        });

        it('debería manejar Decimal con decimales', () => {
            const decimalAmount = new Prisma.Decimal('125.50');
            const result = fxService.convert(decimalAmount, 'USD', 'EUR');
            expect(result).toBe(115.46);
        });

        it('debería retornar 0 para Decimal cero', () => {
            const decimalAmount = new Prisma.Decimal(0);
            const result = fxService.convert(decimalAmount, 'USD', 'CLP');
            expect(result).toBe(0);
        });

        it('debería retornar mismo valor para misma moneda', () => {
            const result = fxService.convert(100, 'USD', 'USD');
            expect(result).toBe(100);
        });

        it('debería redondear CLP a entero', () => {
            const result = fxService.convert(1.55, 'USD', 'CLP');
            expect(result).toBe(1473);
        });

        it('debería redondear USD a 2 decimales', () => {
            const result = fxService.convert(100, 'CLP', 'USD');
            expect(result).toBe(0.11);
        });

        it('debería lanzar error si falta tasa', () => {
            expect(() => {
                fxService.convert(100, 'USD', 'XXX');
            }).toThrow('Missing exchange rate');
        });

        it('debería manejar conversión EUR -> GBP', () => {
            const result = fxService.convert(100, 'EUR', 'GBP');
            expect(result).toBeCloseTo(85.87, 2);
        });
    });

    describe('getRates()', () => {
        it('debería retornar tasas actuales', () => {
            const rates = fxService.getRates();
            expect(rates.base).toBe('USD');
            expect(rates.rates.CLP).toBe(950);
        });
    });

    describe('Edge cases', () => {
        it('debería manejar valores muy grandes', () => {
            const largeValue = 999999999;
            const result = fxService.convert(largeValue, 'USD', 'CLP');
            expect(result).toBe(949999999050);
        });

        it('debería manejar infinito retornando 0', () => {
            const result = fxService.convert(Infinity, 'USD', 'CLP');
            expect(result).toBe(0);
        });
    });
});
