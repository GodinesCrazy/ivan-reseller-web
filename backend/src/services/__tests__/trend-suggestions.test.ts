import { TrendSuggestionsService } from '../trend-suggestions.service';
import { prisma } from '../../config/database';

// Mock de Prisma
jest.mock('../../config/database', () => ({
  prisma: {
    opportunity: {
      findMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
  },
}));

describe('TrendSuggestionsService - Sanitización de Valores', () => {
  let service: TrendSuggestionsService;

  beforeEach(() => {
    service = new TrendSuggestionsService();
    jest.clearAllMocks();
  });

  describe('Sanitización de valores numéricos extremos', () => {
    it('debe filtrar valores de ROI extremos (notación científica)', async () => {
      const mockOpportunities = [
        {
          title: 'Producto Test',
          costUsd: 10,
          suggestedPriceUsd: 20,
          profitMargin: 0.5,
          roiPercentage: 1.0101010101010102e88, // Valor extremo
          confidenceScore: 0.8,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
        {
          title: 'Producto Test 2',
          costUsd: 15,
          suggestedPriceUsd: 30,
          profitMargin: 0.5,
          roiPercentage: 50, // Valor normal
          confidenceScore: 0.85,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
      ];

      (prisma.opportunity.findMany as jest.Mock).mockResolvedValue(mockOpportunities);

      const trends = await service.analyzeTrends(1, 30);

      // Verificar que el ROI extremo fue filtrado
      trends.forEach(trend => {
        expect(trend.avgROI).toBeLessThanOrEqual(1000);
        expect(trend.avgROI).toBeGreaterThanOrEqual(0);
        expect(isFinite(trend.avgROI)).toBe(true);
      });
    });

    it('debe manejar valores NaN e Infinity correctamente', async () => {
      const mockOpportunities = [
        {
          title: 'Producto NaN',
          costUsd: 10,
          suggestedPriceUsd: 20,
          profitMargin: NaN,
          roiPercentage: Infinity,
          confidenceScore: -Infinity,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
        {
          title: 'Producto Normal',
          costUsd: 15,
          suggestedPriceUsd: 30,
          profitMargin: 0.5,
          roiPercentage: 50,
          confidenceScore: 0.8,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
      ];

      (prisma.opportunity.findMany as jest.Mock).mockResolvedValue(mockOpportunities);

      const trends = await service.analyzeTrends(1, 30);

      trends.forEach(trend => {
        expect(isFinite(trend.avgMargin)).toBe(true);
        expect(isFinite(trend.avgROI)).toBe(true);
        expect(isFinite(trend.avgConfidence)).toBe(true);
        expect(trend.avgMargin).toBeGreaterThanOrEqual(0);
        expect(trend.avgMargin).toBeLessThanOrEqual(1);
        expect(trend.avgROI).toBeGreaterThanOrEqual(0);
        expect(trend.avgROI).toBeLessThanOrEqual(1000);
      });
    });

    it('debe limitar ROI a máximo 1000%', async () => {
      const mockOpportunities = [
        {
          title: 'Producto ROI Alto',
          costUsd: 10,
          suggestedPriceUsd: 20,
          profitMargin: 0.9,
          roiPercentage: 5000, // Muy alto, debe limitarse
          confidenceScore: 0.9,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
      ];

      (prisma.opportunity.findMany as jest.Mock).mockResolvedValue(mockOpportunities);

      const trends = await service.analyzeTrends(1, 30);

      trends.forEach(trend => {
        expect(trend.avgROI).toBeLessThanOrEqual(1000);
      });
    });

    it('debe calcular promedios correctamente con valores válidos', async () => {
      const mockOpportunities = [
        {
          title: 'Producto 1',
          costUsd: 10,
          suggestedPriceUsd: 20,
          profitMargin: 0.4,
          roiPercentage: 50,
          confidenceScore: 0.8,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
        {
          title: 'Producto 2',
          costUsd: 15,
          suggestedPriceUsd: 30,
          profitMargin: 0.5,
          roiPercentage: 60,
          confidenceScore: 0.85,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
      ];

      (prisma.opportunity.findMany as jest.Mock).mockResolvedValue(mockOpportunities);

      const trends = await service.analyzeTrends(1, 30);

      // Verificar que los promedios son correctos
      expect(trends.length).toBeGreaterThan(0);
      trends.forEach(trend => {
        expect(trend.avgMargin).toBeGreaterThan(0);
        expect(trend.avgROI).toBeGreaterThan(0);
        expect(trend.avgConfidence).toBeGreaterThan(0);
      });
    });
  });

  describe('Generación de sugerencias de keywords', () => {
    it('debe generar sugerencias con valores sanitizados', async () => {
      const mockOpportunities = [
        {
          title: 'wireless earbuds bluetooth',
          costUsd: 10,
          suggestedPriceUsd: 25,
          profitMargin: 0.6,
          roiPercentage: 75,
          confidenceScore: 0.85,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
      ];

      (prisma.opportunity.findMany as jest.Mock).mockResolvedValue(mockOpportunities);

      const suggestions = await service.generateKeywordSuggestions(1, 5);

      suggestions.forEach(suggestion => {
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(100);
        expect(typeof suggestion.supportingMetric.value).toBe('number');
        expect(isFinite(suggestion.supportingMetric.value)).toBe(true);
        
        // Verificar que el ROI en la descripción no contiene notación científica
        if (suggestion.supportingMetric.type === 'roi') {
          expect(suggestion.supportingMetric.value).toBeLessThanOrEqual(1000);
          expect(suggestion.reason).not.toMatch(/e\+/i);
          expect(suggestion.reason).not.toMatch(/e\-/i);
        }
      });
    });

    it('debe formatear ROI sin notación científica en las razones', async () => {
      const mockOpportunities = [
        {
          title: 'gaming keyboard mechanical',
          costUsd: 20,
          suggestedPriceUsd: 50,
          profitMargin: 0.6,
          roiPercentage: 150, // ROI alto pero válido
          confidenceScore: 0.9,
          targetMarketplaces: ['ebay'],
          marketDemand: 'high',
          createdAt: new Date(),
        },
      ];

      (prisma.opportunity.findMany as jest.Mock).mockResolvedValue(mockOpportunities);

      const suggestions = await service.generateKeywordSuggestions(1, 5);

      suggestions.forEach(suggestion => {
        // Verificar que no hay notación científica en el texto
        expect(suggestion.reason).not.toMatch(/[\d.]+e[+-]\d+/i);
        expect(suggestion.keywordSupportingMetric?.description || '').not.toMatch(/[\d.]+e[+-]\d+/i);
      });
    });
  });
});

