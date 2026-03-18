/**
 * Integration test: GET /api/orders returns only real marketplace orders (ebay:, mercadolibre:, amazon:).
 * Run with: TEST_TYPE=integration npx jest src/__tests__/integration/orders-real-filter.integration.test.ts
 */
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import bcrypt from 'bcryptjs';
import { authService } from '../../services/auth.service';
import { isRealMarketplaceOrderPaypalId } from '../../utils/orders-real-filter';

describe('GET /api/orders real-orders-only filter (integration)', () => {
  const testUser = { username: 'orders_filter_test_user', password: 'test123456', email: 'ordersfilter@test.com' };
  let userId: number;
  let authToken: string;

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
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('returns 200 and only orders with paypalOrderId ebay:, mercadolibre:, or amazon:', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const order of res.body) {
      const pid = order.paypalOrderId ?? '';
      expect(isRealMarketplaceOrderPaypalId(pid)).toBe(true);
    }
  });

  it('excludes checkout/test orders from list', async () => {
    // Create a fake "checkout" order for this user
    await prisma.order.create({
      data: {
        userId,
        title: 'Fake Checkout',
        price: 10,
        currency: 'USD',
        customerName: 'Test',
        customerEmail: 't@t.com',
        shippingAddress: '{}',
        status: 'PAID',
        paypalOrderId: 'checkout:fake-123',
        productUrl: '',
      },
    });
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const checkoutOrder = res.body.find((o: any) => (o.paypalOrderId || '').startsWith('checkout:'));
    expect(checkoutOrder).toBeUndefined();
    // Cleanup
    await prisma.order.deleteMany({ where: { userId, paypalOrderId: 'checkout:fake-123' } });
  });
});
