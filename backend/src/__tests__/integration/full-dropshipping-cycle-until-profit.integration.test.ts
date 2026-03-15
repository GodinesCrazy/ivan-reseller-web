/**
 * Integration test: flujo post-venta hasta utilidad (Sale con netProfit).
 * Verifica que Order con userId + productId → createSaleFromOrder → Sale con netProfit.
 * No requiere PayPal ni AliExpress reales; simula Order PURCHASED y llama al servicio.
 */

import { prisma } from '../../config/database';
import { saleService } from '../../services/sale.service';

const TEST_TIMEOUT = 15000;

describe('Full Dropshipping Cycle Until Profit (integration)', () => {
  let testUserId: number | undefined;
  let testProductId: number | undefined;
  let testOrderId: string;
  let testSaleId: number | null = null;

  beforeAll(async () => {
    const user = await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!user) return;
    testUserId = user.id;

    const product = await prisma.product.findFirst({
      where: { userId: testUserId, status: { in: ['APPROVED', 'PUBLISHED'] } },
      select: { id: true, aliexpressPrice: true, aliexpressUrl: true },
    });
    if (!product) return;
    testProductId = product.id;
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (testSaleId != null) {
      try {
        await prisma.sale.delete({ where: { id: testSaleId } });
      } catch {
        // ignore
      }
    }
    if (testOrderId) {
      try {
        await prisma.order.delete({ where: { id: testOrderId } });
      } catch {
        // ignore
      }
    }
    await prisma.$disconnect();
  });

  it(
    'creates Sale with netProfit when Order has userId and productId and is PURCHASED',
    async () => {
      if (testUserId == null || testProductId == null) {
        return; // skip when no user/product (e.g. CI without seed); test passes
      }
      const product = await prisma.product.findUnique({
        where: { id: testProductId },
        select: { aliexpressPrice: true, aliexpressUrl: true },
      });
      if (!product) {
        console.warn('Skip: product not found');
        return;
      }
      const costPrice = Number(product.aliexpressPrice ?? 0);
      const salePrice = costPrice <= 0 ? 19.99 : costPrice * 1.8;

      const order = await prisma.order.create({
        data: {
          userId: testUserId,
          productId: testProductId,
          title: 'Integration Test Order',
          price: salePrice,
          currency: 'USD',
          customerName: 'Test Buyer',
          customerEmail: 'test@example.com',
          shippingAddress: JSON.stringify({
            fullName: 'Test Buyer',
            addressLine1: '123 Test St',
            city: 'Miami',
            state: 'FL',
            country: 'US',
            zipCode: '33101',
            phoneNumber: '+15551234567',
          }),
          status: 'PURCHASED',
          paypalOrderId: `test-integration-${Date.now()}`,
          productUrl: product.aliexpressUrl || 'https://www.aliexpress.com/item/0.html',
        },
      });
      testOrderId = order.id;

      const result = await saleService.createSaleFromOrder(order.id);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('id');
      testSaleId = result!.id;

      const sale = await prisma.sale.findUnique({
        where: { id: result!.id },
        select: { orderId: true, netProfit: true, salePrice: true, userId: true, productId: true },
      });
      expect(sale).not.toBeNull();
      expect(sale!.orderId).toBe(order.id);
      expect(sale!.userId).toBe(testUserId);
      expect(sale!.productId).toBe(testProductId);
      expect(typeof sale!.netProfit).toBe('number');
      expect(sale!.netProfit).toBeGreaterThanOrEqual(0);
    },
    TEST_TIMEOUT
  );
});
