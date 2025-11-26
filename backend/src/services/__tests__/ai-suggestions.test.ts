import { AISuggestionsService } from '../ai-suggestions.service';
import { prisma } from '../../config/database';

// Mock de Prisma y CredentialsManager
jest.mock('../../config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    sale: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
    opportunity: {
      findMany: jest.fn(),
    },
    aISuggestion: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../credentials-manager.service', () => ({
  CredentialsManager: {
    getCredentials: jest.fn(),
  },
}));

describe('AISuggestionsService - Sanitización de Valores', () => {
  let service: AISuggestionsService;

  beforeEach(() => {
    service = new AISuggestionsService();
    jest.clearAllMocks();
  });

  describe('Parseo de sugerencias IA con valores extremos', () => {
    it('debe sanitizar valores numéricos en sugerencias de IA', () => {
      const mockAIResponse = {
        suggestions: [
          {
            type: 'pricing',
            priority: 'high',
            title: 'Optimizar precios',
            description: 'Descripción de prueba',
            impactRevenue: 1.5e15, // Valor extremo
            impactTime: Infinity,
            difficulty: 'easy',
            confidence: 500, // Valor fuera de rango
            estimatedTime: '1 hora',
            requirements: ['req1'],
            steps: ['step1'],
            metrics: {
              currentValue: -100,
              targetValue: NaN,
              unit: 'USD',
            },
          },
          {
            type: 'inventory',
            priority: 'medium',
            title: 'Expandir inventario',
            description: 'Otra descripción',
            impactRevenue: 50000, // Valor normal
            impactTime: 2,
            difficulty: 'medium',
            confidence: 75,
            estimatedTime: '30 minutos',
            requirements: [],
            steps: [],
          },
        ],
      };

      // Acceder al método privado usando reflect o type casting
      const parseMethod = (service as any).parseAISuggestions.bind(service);
      const suggestions = parseMethod(mockAIResponse, {
        totalSales: 0,
        totalRevenue: 0,
        totalProfit: 0,
        activeProducts: 0,
        averageProfitMargin: 0,
        bestCategory: 'General',
        worstCategory: 'General',
        products: [],
        recentOpportunities: 0,
      });

      // Verificar que los valores fueron sanitizados
      expect(suggestions.length).toBe(2);

      // Primera sugerencia (valores extremos)
      expect(suggestions[0].impact.revenue).toBeLessThanOrEqual(1000000);
      expect(suggestions[0].impact.time).toBeLessThanOrEqual(1000);
      expect(suggestions[0].confidence).toBeLessThanOrEqual(100);
      expect(suggestions[0].confidence).toBeGreaterThanOrEqual(0);
      expect(isFinite(suggestions[0].impact.revenue)).toBe(true);
      expect(isFinite(suggestions[0].impact.time)).toBe(true);

      // Segunda sugerencia (valores normales)
      expect(suggestions[1].impact.revenue).toBe(50000);
      expect(suggestions[1].impact.time).toBe(2);
      expect(suggestions[1].confidence).toBe(75);
    });

    it('debe manejar valores null y undefined', () => {
      const mockAIResponse = {
        suggestions: [
          {
            type: 'pricing',
            priority: 'high',
            title: 'Test',
            description: 'Test',
            impactRevenue: null,
            impactTime: undefined,
            difficulty: 'easy',
            confidence: null,
            estimatedTime: '1 hora',
            requirements: [],
            steps: [],
            metrics: {
              currentValue: undefined,
              targetValue: null,
              unit: 'USD',
            },
          },
        ],
      };

      const parseMethod = (service as any).parseAISuggestions.bind(service);
      const suggestions = parseMethod(mockAIResponse, {
        totalSales: 0,
        totalRevenue: 0,
        totalProfit: 0,
        activeProducts: 0,
        averageProfitMargin: 0,
        bestCategory: 'General',
        worstCategory: 'General',
        products: [],
        recentOpportunities: 0,
      });

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].impact.revenue).toBe(0); // Valor por defecto
      expect(suggestions[0].impact.time).toBe(0); // Valor por defecto
      expect(suggestions[0].confidence).toBe(75); // Valor por defecto
    });

    it('debe sanitizar métricas correctamente', () => {
      const mockAIResponse = {
        suggestions: [
          {
            type: 'optimization',
            priority: 'medium',
            title: 'Optimización',
            description: 'Test',
            impactRevenue: 1000,
            impactTime: 1,
            difficulty: 'easy',
            confidence: 80,
            estimatedTime: '1 hora',
            requirements: [],
            steps: [],
            metrics: {
              currentValue: 1e20, // Valor extremo
              targetValue: -5000, // Valor negativo
              unit: '%',
            },
          },
        ],
      };

      const parseMethod = (service as any).parseAISuggestions.bind(service);
      const suggestions = parseMethod(mockAIResponse, {
        totalSales: 0,
        totalRevenue: 0,
        totalProfit: 0,
        activeProducts: 0,
        averageProfitMargin: 0,
        bestCategory: 'General',
        worstCategory: 'General',
        products: [],
        recentOpportunities: 0,
      });

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].metrics).toBeDefined();
      expect(suggestions[0].metrics!.currentValue).toBeLessThanOrEqual(1000000);
      expect(suggestions[0].metrics!.targetValue).toBeGreaterThanOrEqual(0);
      expect(isFinite(suggestions[0].metrics!.currentValue)).toBe(true);
      expect(isFinite(suggestions[0].metrics!.targetValue)).toBe(true);
    });
  });
});

