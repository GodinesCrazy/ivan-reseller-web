// ✅ E6: Tests unitarios para SaleService
import { SaleService } from '../../services/sale.service';
import { PrismaClient } from '@prisma/client';

// Mock Prisma
jest.mock('../../config/database', () => ({
  prisma: {
    product: {
      findUnique: jest.fn(),
    },
    sale: {
      create: jest.fn(),
    },
    commission: {
      create: jest.fn(),
    },
    adminCommission: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    activity: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('SaleService', () => {
  let saleService: SaleService;

  beforeEach(() => {
    saleService = new SaleService();
    jest.clearAllMocks();
  });

  describe('createSale', () => {
    it('should calculate commission correctly (20% of gross profit)', async () => {
      const userId = 1;
      const saleData = {
        orderId: 'ORD-123',
        productId: 1,
        marketplace: 'ebay',
        salePrice: 100,
        costPrice: 50,
        platformFees: 5,
      };

      const { prisma } = require('../../config/database');
      
      const mockProduct = {
        id: 1,
        userId: 1,
        title: 'Test Product',
        status: 'PUBLISHED',
        isPublished: true,
      };

      const mockUser = {
        id: userId,
        commissionRate: 0.20, // 20%
        createdBy: null,
      };

      const mockSale = {
        id: 1,
        ...saleData,
        grossProfit: 50, // 100 - 50
        commissionAmount: 10, // 50 * 0.20
        netProfit: 35, // 50 - 10 - 5
        userId,
        createdAt: new Date(),
      };

      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(prisma);
      });
      prisma.sale.create.mockResolvedValue(mockSale);
      prisma.commission.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
      prisma.activity.create.mockResolvedValue({});

      // Mock notifications service
      jest.mock('../../services/notifications.service', () => ({
        notificationService: {
          sendSaleNotification: jest.fn().mockResolvedValue({}),
        },
      }));

      const result = await saleService.createSale(userId, saleData);

      // Verificar cálculo de comisión
      const grossProfit = saleData.salePrice - saleData.costPrice; // 50
      const expectedCommission = grossProfit * mockUser.commissionRate; // 10
      const expectedNetProfit = grossProfit - expectedCommission - saleData.platformFees; // 35

      expect(prisma.commission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: expectedCommission,
          }),
        })
      );

      expect(result.grossProfit).toBe(grossProfit);
      expect(result.commissionAmount).toBe(expectedCommission);
      expect(result.netProfit).toBe(expectedNetProfit);
    });

    it('should reject sale if salePrice <= costPrice', async () => {
      const userId = 1;
      const invalidSaleData = {
        orderId: 'ORD-123',
        productId: 1,
        marketplace: 'ebay',
        salePrice: 50,
        costPrice: 100, // Higher than sale price
      };

      const { prisma } = require('../../config/database');
      prisma.product.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'PUBLISHED',
        isPublished: true,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        commissionRate: 0.20,
      });

      await expect(
        saleService.createSale(userId, invalidSaleData)
      ).rejects.toThrow('Sale price must be greater than cost price');
    });

    it('should reject sale if product status is REJECTED', async () => {
      const userId = 1;
      const saleData = {
        orderId: 'ORD-123',
        productId: 1,
        marketplace: 'ebay',
        salePrice: 100,
        costPrice: 50,
      };

      const { prisma } = require('../../config/database');
      prisma.product.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'REJECTED',
        isPublished: false,
      });

      await expect(
        saleService.createSale(userId, saleData)
      ).rejects.toThrow('Cannot create sale for product with status: REJECTED');
    });
  });
});

