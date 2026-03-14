// E6: Tests unitarios para SaleService
import { SaleService } from '../../services/sale.service';

jest.mock('../../services/platform-config.service', () => ({
  platformConfigService: {
    getCommissionPct: jest.fn().mockResolvedValue(20),
    getAdminPaypalEmail: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../services/user-settings.service', () => ({
  UserSettingsService: jest.fn().mockImplementation(() => ({
    getUserBaseCurrency: jest.fn().mockResolvedValue('USD'),
  })),
}));

jest.mock('../../services/fx.service', () => ({
  __esModule: true,
  default: { convert: jest.fn((v: number) => v) },
}));

jest.mock('../../services/notification.service', () => ({
  notificationService: { sendSaleNotification: jest.fn().mockResolvedValue({}) },
}));

const mockTx = {
  sale: { create: jest.fn() },
  commission: { create: jest.fn() },
  adminCommission: { create: jest.fn() },
  activity: { create: jest.fn() },
};

jest.mock('../../config/database', () => ({
  prisma: {
    product: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    sale: { create: jest.fn(), update: jest.fn() },
    commission: { create: jest.fn() },
    adminCommission: { create: jest.fn() },
    activity: { create: jest.fn() },
    $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(mockTx)),
  },
}));

describe('SaleService', () => {
  let saleService: SaleService;

  beforeEach(() => {
    saleService = new SaleService();
    jest.clearAllMocks();
    mockTx.sale.create.mockReset();
    mockTx.commission.create.mockReset();
    mockTx.adminCommission.create.mockReset();
    mockTx.activity.create.mockReset();
  });

  describe('createSale', () => {
    it('should calculate commission correctly (20% of gross profit)', async () => {
      const userId = 1;
      const orderId = `ORD-test-1-${Date.now()}`;
      const saleData = {
        orderId,
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
        user: {},
      };
      const mockUser = {
        id: userId,
        commissionRate: 0.20,
        createdBy: null,
        paypalPayoutEmail: null,
      };
      const mockSale = {
        id: 1,
        ...saleData,
        grossProfit: 50,
        commissionAmount: 10,
        netProfit: 35,
        userId,
        createdAt: new Date(),
      };

      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      mockTx.sale.create.mockResolvedValue(mockSale);
      mockTx.commission.create.mockResolvedValue({});
      mockTx.activity.create.mockResolvedValue({});
      prisma.sale.update.mockResolvedValue(mockSale);

      const result = await saleService.createSale(userId, saleData);

      const grossProfit = saleData.salePrice - saleData.costPrice - (saleData.platformFees || 0);
      const expectedCommission = grossProfit * 0.20;
      const expectedNetProfit = grossProfit - expectedCommission;

      expect(result.grossProfit).toBe(grossProfit);
      expect(result.commissionAmount).toBe(expectedCommission);
      expect(result.netProfit).toBe(expectedNetProfit);
    });

    it('should reject sale if salePrice <= costPrice', async () => {
      const userId = 1;
      const invalidSaleData = {
        orderId: `ORD-test-2-${Date.now()}`,
        productId: 1,
        marketplace: 'ebay',
        salePrice: 50,
        costPrice: 100,
      };

      const { prisma } = require('../../config/database');
      prisma.product.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'PUBLISHED',
        isPublished: true,
        user: {},
      });

      await expect(
        saleService.createSale(userId, invalidSaleData)
      ).rejects.toThrow(/Sale price .* must be greater than cost price/);
    });

    it('should reject sale if product status is REJECTED', async () => {
      const userId = 1;
      const saleData = {
        orderId: `ORD-test-3-${Date.now()}`,
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
        user: {},
      });

      await expect(
        saleService.createSale(userId, saleData)
      ).rejects.toThrow(/Cannot create sale for product with status: REJECTED/);
    });
  });
});

