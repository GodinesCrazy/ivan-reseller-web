/**
 * Integration tests: POST retry-fulfill, POST force-fulfill, PATCH reset-purchasing.
 * Mocks orderFulfillmentService and hasSufficientFreeCapital so no real PayPal/AliExpress calls.
 */
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import bcrypt from 'bcryptjs';
import { authService } from '../../services/auth.service';

const mockFulfillOrder = jest.fn();
const mockHasSufficientFreeCapital = jest.fn();

jest.mock('../../services/order-fulfillment.service', () => ({
  orderFulfillmentService: {
    fulfillOrder: (...args: any[]) => mockFulfillOrder(...args),
  },
}));

jest.mock('../../services/working-capital.service', () => ({
  hasSufficientFreeCapital: (...args: any[]) => mockHasSufficientFreeCapital(...args),
}));

describe('Orders fulfillment API (integration)', () => {
  const testUser = {
    username: 'orders_fulfillment_test_user',
    password: 'test123456',
    email: 'ordersfulfill@test.com',
  };
  let userId: number;
  let authToken: string;
  let orderIdFailed: string;
  let orderIdPaid: string;
  let orderIdPurchasing: string;
  const ebayOrderId = `17-14378-${Date.now()}`;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { username: testUser.username } });
    const hash = await bcrypt.hash(testUser.password, 10);
    const user = await prisma.user.create({
      data: {
        username: testUser.username,
        email: testUser.email,
        password: hash,
        role: 'ADMIN',
        commissionRate: 0.15,
        isActive: true,
      },
    });
    userId = user.id;
    authToken = authService.generateToken(user.id, user.username, user.role || 'ADMIN');
    mockHasSufficientFreeCapital.mockResolvedValue({
      sufficient: true,
      freeWorkingCapital: 1000,
      required: 100,
      snapshot: {} as any,
    });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: {
        id: { in: [orderIdFailed, orderIdPaid, orderIdPurchasing].filter(Boolean) },
      },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mockFulfillOrder.mockReset();
    mockHasSufficientFreeCapital.mockResolvedValue({
      sufficient: true,
      freeWorkingCapital: 1000,
      required: 100,
      snapshot: {} as any,
    });
  });

  it('POST /api/orders/:id/retry-fulfill returns 400 when order is not FAILED', async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        title: 'Test Order PAID',
        price: 61.41,
        currency: 'USD',
        customerName: 'Buyer',
        customerEmail: 'b@test.com',
        shippingAddress: JSON.stringify({
          fullName: 'Buyer',
          addressLine1: '123 St',
          city: 'Miami',
          state: 'FL',
          country: 'US',
          zipCode: '33101',
        }),
        status: 'PAID',
        paypalOrderId: 'ebay:17-xxx',
        productUrl: 'https://www.aliexpress.com/item/1.html',
      },
    });
    orderIdPaid = order.id;

    const res = await request(app)
      .post(`/api/orders/${order.id}/retry-fulfill`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not in FAILED status/i);
    expect(res.body.status).toBe('PAID');
    expect(mockFulfillOrder).not.toHaveBeenCalled();

    await prisma.order.delete({ where: { id: order.id } });
  });

  it('POST /api/orders/:id/retry-fulfill returns 200 and success when mock returns PURCHASED', async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        title: 'Test Order FAILED',
        price: 61.41,
        currency: 'USD',
        customerName: 'Buyer',
        customerEmail: 'b@test.com',
        shippingAddress: JSON.stringify({
          fullName: 'Buyer',
          addressLine1: '123 St',
          city: 'Miami',
          state: 'FL',
          country: 'US',
          zipCode: '33101',
        }),
        status: 'FAILED',
        errorMessage: 'FAILED_INSUFFICIENT_FUNDS: Insufficient free working capital',
        fulfillRetryCount: 0,
        paypalOrderId: 'ebay:17-xxx',
        productUrl: 'https://www.aliexpress.com/item/1.html',
      },
    });
    orderIdFailed = order.id;

    mockFulfillOrder.mockResolvedValue({
      success: true,
      orderId: order.id,
      status: 'PURCHASED',
      aliexpressOrderId: 'TEST-AE-123',
    });

    const res = await request(app)
      .post(`/api/orders/${order.id}/retry-fulfill`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('PURCHASED');
    expect(res.body.orderId).toBe(order.id);
    expect(res.body.aliexpressOrderId).toBe('TEST-AE-123');
    expect(mockFulfillOrder).toHaveBeenCalledWith(order.id);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAID'); // route sets PAID before calling fulfillOrder; mock doesn't update DB
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('POST /api/orders/by-ebay-id/:ebayOrderId/force-fulfill returns 404 when order not found', async () => {
    const res = await request(app)
      .post('/api/orders/by-ebay-id/INVALID-EBAY-999/force-fulfill')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.ebayOrderId).toBe('INVALID-EBAY-999');
    expect(mockFulfillOrder).not.toHaveBeenCalled();
  });

  it('POST /api/orders/by-ebay-id/:ebayOrderId/force-fulfill returns 200 and success when mock returns PURCHASED', async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        title: 'Test Order PAID for force',
        price: 61.41,
        currency: 'USD',
        customerName: 'Buyer',
        customerEmail: 'b@test.com',
        shippingAddress: JSON.stringify({
          fullName: 'Buyer',
          addressLine1: '123 St',
          city: 'Miami',
          state: 'FL',
          country: 'US',
          zipCode: '33101',
        }),
        status: 'PAID',
        paypalOrderId: `ebay:${ebayOrderId}`,
        productUrl: 'https://www.aliexpress.com/item/1.html',
      },
    });

    mockFulfillOrder.mockResolvedValue({
      success: true,
      orderId: order.id,
      status: 'PURCHASED',
      aliexpressOrderId: 'TEST-AE-456',
    });

    const res = await request(app)
      .post(`/api/orders/by-ebay-id/${ebayOrderId}/force-fulfill`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('PURCHASED');
    expect(res.body.orderId).toBe(order.id);
    expect(res.body.aliexpressOrderId).toBe('TEST-AE-456');
    expect(mockFulfillOrder).toHaveBeenCalledWith(order.id);

    await prisma.order.delete({ where: { id: order.id } });
  });

  it('PATCH /api/orders/:id/reset-purchasing returns 400 when order is not PURCHASING', async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        title: 'Test Order PAID',
        price: 61.41,
        currency: 'USD',
        customerName: 'Buyer',
        customerEmail: 'b@test.com',
        shippingAddress: '{}',
        status: 'PAID',
        paypalOrderId: 'ebay:17-xxx',
        productUrl: 'https://www.aliexpress.com/item/1.html',
      },
    });

    const res = await request(app)
      .patch(`/api/orders/${order.id}/reset-purchasing`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not in PURCHASING status/i);
    expect(res.body.status).toBe('PAID');

    await prisma.order.delete({ where: { id: order.id } });
  });

  it('PATCH /api/orders/:id/reset-purchasing returns 200 and sets order to PAID', async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        title: 'Test Order PURCHASING',
        price: 61.41,
        currency: 'USD',
        customerName: 'Buyer',
        customerEmail: 'b@test.com',
        shippingAddress: '{}',
        status: 'PURCHASING',
        paypalOrderId: 'ebay:17-xxx',
        productUrl: 'https://www.aliexpress.com/item/1.html',
      },
    });
    orderIdPurchasing = order.id;

    const res = await request(app)
      .patch(`/api/orders/${order.id}/reset-purchasing`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    expect(res.body.id).toBe(order.id);
    expect(res.body.errorMessage).toBeNull();

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAID');
    expect(updated?.errorMessage).toBeNull();
  });
});
