/**
 * Tests for OrderFulfillmentService
 * Verifies order validation, status transitions, and error handling.
 */

jest.mock('../../config/database', () => ({
  prisma: {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    purchaseAttemptLog: {
      count: jest.fn().mockResolvedValue(0),
    },
  },
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../purchase-retry.service', () => ({
  purchaseRetryService: {
    attemptPurchase: jest.fn(),
  },
}));

jest.mock('../daily-limits.service', () => ({
  checkDailyLimits: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../working-capital.service', () => ({
  hasSufficientFreeCapital: jest.fn().mockResolvedValue({
    sufficient: true,
    required: 0,
    freeWorkingCapital: 10_000,
    snapshot: {
      realAvailableBalance: 10_000,
      committedCapital: 0,
      freeWorkingCapital: 10_000,
      currency: 'USD',
    },
  }),
}));

import { OrderFulfillmentService } from '../order-fulfillment.service';
import { prisma } from '../../config/database';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFindUnique = mockPrisma.order.findUnique as jest.Mock;
const mockUpdate = mockPrisma.order.update as jest.Mock;

describe('OrderFulfillmentService', () => {
  let service: OrderFulfillmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderFulfillmentService();
  });

  describe('fulfillOrder', () => {
    it('should return FAILED when order is not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await service.fulfillOrder('non-existent-order-id');

      expect(result).toEqual({
        success: false,
        orderId: 'non-existent-order-id',
        status: 'FAILED',
        error: 'Order not found',
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should return error when order status is not PAID', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'order-1',
        status: 'CREATED',
        price: 10,
        productUrl: 'https://example.com/item',
        shippingAddress: JSON.stringify({
          fullName: 'Test',
          addressLine1: '123 Main St',
          city: 'Miami',
          state: 'FL',
          country: 'US',
          zipCode: '33101',
        }),
      } as any);

      const result = await service.fulfillOrder('order-1');

      expect(result.success).toBe(false);
      expect(result.status).toBe('CREATED');
      expect(result.error).toMatch(/must be PAID|MANUAL_ACTION_REQUIRED/);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should return FAILED and call markFailed when fulfillment times out', async () => {
      const { purchaseRetryService } = require('../purchase-retry.service');
      const mockAttemptPurchase = purchaseRetryService.attemptPurchase as jest.Mock;

      mockFindUnique
        .mockResolvedValueOnce({
          id: 'order-timeout',
          status: 'PAID',
          price: 50,
          productUrl: 'https://www.aliexpress.com/item/123.html',
          productId: null,
          userId: null,
          shippingAddress: JSON.stringify({
            fullName: 'Test',
            addressLine1: '123 Main St',
            city: 'Miami',
            state: 'FL',
            country: 'US',
            zipCode: '33101',
          }),
        } as any)
        .mockResolvedValue({ status: 'FAILED' } as any);
      mockUpdate.mockResolvedValue({});

      const timeoutMessage =
        'Fulfillment timeout: la compra tardó demasiado. Comprueba el estado en AliExpress o inténtalo de nuevo.';
      // Reject immediately so Promise.race surfaces the same error as the timeout path
      mockAttemptPurchase.mockRejectedValue(new Error(timeoutMessage));

      const result = await service.fulfillOrder('order-timeout');

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/timeout|tardó demasiado/i);
      expect(mockUpdate).toHaveBeenCalled();
      const updateCalls = mockUpdate.mock.calls;
      const markFailedCall = updateCalls.find((c: any[]) => c[0].data?.status === 'FAILED');
      expect(markFailedCall).toBeDefined();
    });
  });
});
