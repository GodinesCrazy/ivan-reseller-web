// ✅ E6: Tests unitarios para OpportunityService
import opportunityPersistence from '../../services/opportunity.service';
import { prisma } from '../../config/database';

// Mock Prisma
jest.mock('../../config/database', () => ({
  prisma: {
    opportunity: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    competitionSnapshot: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

describe('OpportunityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveOpportunity', () => {
    it('should save opportunity with correct userId', async () => {
      const userId = 1;
      const opportunityData = {
        title: 'Test Opportunity',
        sourceMarketplace: 'aliexpress',
        costUsd: 10,
        suggestedPriceUsd: 20,
        profitMargin: 0.5,
        roiPercentage: 100,
        competitionLevel: 'low',
        marketDemand: 'high',
        confidenceScore: 0.8,
        feesConsidered: {},
        targetMarketplaces: ['ebay'],
      };

      const { prisma } = require('../../config/database');
      const mockOpportunity = {
        id: 1,
        userId,
        ...opportunityData,
        createdAt: new Date(),
      };

      prisma.opportunity.create.mockResolvedValue(mockOpportunity);
      prisma.competitionSnapshot.create.mockResolvedValue({});

      const result = await opportunityPersistence.saveOpportunity(
        userId,
        opportunityData,
        {}
      );

      expect(result).toEqual(mockOpportunity);
      expect(prisma.opportunity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
          }),
        })
      );
    });
  });

  describe('listUserOpportunities', () => {
    it('should filter opportunities by userId', async () => {
      const userId = 1;
      const page = 1;
      const limit = 20;

      const { prisma } = require('../../config/database');
      const mockOpportunities = [
        { id: 1, userId: 1, title: 'Opp 1' },
        { id: 2, userId: 1, title: 'Opp 2' },
      ];

      prisma.opportunity.findMany.mockResolvedValue(mockOpportunities);
      prisma.opportunity.count.mockResolvedValue(2);

      const result = await opportunityPersistence.listUserOpportunities(userId, page, limit);

      expect(result.items).toEqual(mockOpportunities);
      expect(result.count).toBe(2);
      expect(prisma.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
        })
      );
      expect(prisma.opportunity.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
        })
      );
    });

    it('should paginate correctly', async () => {
      const userId = 1;
      const page = 2;
      const limit = 10;

      const { prisma } = require('../../config/database');
      prisma.opportunity.findMany.mockResolvedValue([]);
      prisma.opportunity.count.mockResolvedValue(25);

      const result = await opportunityPersistence.listUserOpportunities(userId, page, limit);

      expect(result.page).toBe(2);
      expect(prisma.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page - 1) * limit
          take: 10,
        })
      );
    });
  });

  describe('getOpportunity', () => {
    it('should filter by userId and id', async () => {
      const userId = 1;
      const opportunityId = 1;

      const { prisma } = require('../../config/database');
      const mockOpportunity = {
        id: opportunityId,
        userId,
        title: 'Test Opportunity',
      };
      const mockSnapshots = [
        { id: 1, opportunityId, marketplace: 'ebay' },
      ];

      prisma.opportunity.findFirst.mockResolvedValue(mockOpportunity);
      prisma.competitionSnapshot.findMany.mockResolvedValue(mockSnapshots);

      const result = await opportunityPersistence.getOpportunity(userId, opportunityId);

      expect(result?.item).toEqual(mockOpportunity);
      expect(result?.snapshots).toEqual(mockSnapshots);
      expect(prisma.opportunity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: opportunityId, userId },
        })
      );
    });

    it('should return null if opportunity not found', async () => {
      const userId = 1;
      const opportunityId = 999;

      const { prisma } = require('../../config/database');
      prisma.opportunity.findFirst.mockResolvedValue(null);

      const result = await opportunityPersistence.getOpportunity(userId, opportunityId);

      expect(result).toBeNull();
    });
  });
});

