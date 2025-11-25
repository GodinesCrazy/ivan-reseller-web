/**
 * Tests automatizados para AI Opportunity Finder
 * 
 * Estos tests verifican que el sistema pueda encontrar oportunidades
 * de negocio desde AliExpress, normalizarlas correctamente y filtrarlas
 * según criterios de rentabilidad.
 */

import opportunityFinder from '../opportunity-finder.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('AI Opportunity Finder', () => {
  let testUserId: number;
  
  beforeAll(async () => {
    // Crear o obtener usuario de prueba
    const testUser = await prisma.user.findFirst({
      where: { email: 'test@ivanreseller.com' }
    });
    
    if (!testUser) {
      const newUser = await prisma.user.create({
        data: {
          email: 'test@ivanreseller.com',
          password: 'test123',
          name: 'Test User'
        }
      });
      testUserId = newUser.id;
    } else {
      testUserId = testUser.id;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Búsqueda de oportunidades', () => {
    it('debe encontrar al menos 5 resultados para "auriculares"', async () => {
      const results = await opportunityFinder.findOpportunities(testUserId, {
        query: 'auriculares',
        maxItems: 10,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'us'
      });

      expect(results.length).toBeGreaterThanOrEqual(5);
      
      // Verificar que cada resultado tiene los campos requeridos
      results.forEach(result => {
        expect(result.title).toBeTruthy();
        expect(result.title.length).toBeGreaterThan(0);
        expect(result.costUsd).toBeGreaterThan(0);
        expect(result.suggestedPriceUsd).toBeGreaterThan(0);
        expect(result.profitMargin).toBeGreaterThan(0);
        expect(result.aliexpressUrl).toBeTruthy();
        expect(result.aliexpressUrl.length).toBeGreaterThan(10);
      });
    }, 120000); // 2 minutos timeout

    it('debe encontrar al menos 5 resultados para "gaming"', async () => {
      const results = await opportunityFinder.findOpportunities(testUserId, {
        query: 'gaming',
        maxItems: 10,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'us'
      });

      expect(results.length).toBeGreaterThanOrEqual(5);
      
      // Verificar que cada resultado tiene imagen válida o placeholder
      results.forEach(result => {
        expect(result.image).toBeTruthy();
        expect(result.image?.length).toBeGreaterThan(0);
      });
    }, 120000);

    it('debe encontrar al menos 3 resultados para "mouse"', async () => {
      const results = await opportunityFinder.findOpportunities(testUserId, {
        query: 'mouse',
        maxItems: 10,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'us'
      });

      expect(results.length).toBeGreaterThanOrEqual(3);
      
      // Verificar que cada resultado tiene ROI válido
      results.forEach(result => {
        expect(result.roiPercentage).toBeGreaterThan(0);
        expect(result.confidenceScore).toBeGreaterThan(0);
        expect(result.confidenceScore).toBeLessThanOrEqual(1);
      });
    }, 120000);

    it('debe encontrar al menos 3 resultados para "smartwatch"', async () => {
      const results = await opportunityFinder.findOpportunities(testUserId, {
        query: 'smartwatch',
        maxItems: 10,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'us'
      });

      expect(results.length).toBeGreaterThanOrEqual(3);
      
      // Verificar que cada resultado tiene target marketplaces
      results.forEach(result => {
        expect(result.targetMarketplaces).toBeTruthy();
        expect(Array.isArray(result.targetMarketplaces)).toBe(true);
        expect(result.targetMarketplaces.length).toBeGreaterThan(0);
      });
    }, 120000);
  });

  describe('Validación de datos', () => {
    it('debe retornar resultados con margen de ganancia válido', async () => {
      const results = await opportunityFinder.findOpportunities(testUserId, {
        query: 'auriculares',
        maxItems: 5,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'us'
      });

      if (results.length > 0) {
        results.forEach(result => {
          // El margen debe ser entre 0 y 1 (0% a 100%)
          expect(result.profitMargin).toBeGreaterThanOrEqual(0);
          expect(result.profitMargin).toBeLessThanOrEqual(1);
          
          // El precio sugerido debe ser mayor que el costo
          expect(result.suggestedPriceUsd).toBeGreaterThan(result.costUsd);
          
          // El ROI debe ser positivo
          expect(result.roiPercentage).toBeGreaterThan(0);
        });
      }
    }, 120000);

    it('debe retornar resultados con monedas válidas', async () => {
      const results = await opportunityFinder.findOpportunities(testUserId, {
        query: 'gaming',
        maxItems: 5,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'us'
      });

      if (results.length > 0) {
        results.forEach(result => {
          // La moneda debe ser un código válido de 3 letras
          expect(result.costCurrency).toMatch(/^[A-Z]{3}$/);
          expect(result.suggestedPriceCurrency).toMatch(/^[A-Z]{3}$/);
        });
      }
    }, 120000);
  });

  describe('Manejo de errores', () => {
    it('debe retornar array vacío para query vacío', async () => {
      const results = await opportunityFinder.findOpportunities(testUserId, {
        query: '',
        maxItems: 10,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'us'
      });

      expect(results).toEqual([]);
    });

    it('debe retornar array vacío para query con solo espacios', async () => {
      const results = await opportunityFinder.findOpportunities(testUserId, {
        query: '   ',
        maxItems: 10,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'us'
      });

      expect(results).toEqual([]);
    });
  });
});

