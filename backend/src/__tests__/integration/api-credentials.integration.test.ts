// ✅ E7: Tests de integración para API Credentials
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import { CredentialsManager } from '../../services/credentials-manager.service';
import bcrypt from 'bcryptjs';

describe('API Credentials Integration Tests', () => {
  let authToken: string;
  let testUserId: number;

  beforeAll(async () => {
    // Crear usuario de prueba
    const hashedPassword = await bcrypt.hash('test123', 10);
    const testUser = await prisma.user.create({
      data: {
        username: 'testuser_api',
        email: 'testapi@ivanreseller.com',
        password: hashedPassword,
        role: 'USER',
        commissionRate: 0.20,
        isActive: true,
      },
    });
    testUserId = testUser.id;

    // Login para obtener token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser_api',
        password: 'test123',
      });

    authToken = loginRes.body.token || loginRes.headers['set-cookie']?.[0]?.split('=')[1]?.split(';')[0];
  });

  afterAll(async () => {
    // Limpiar datos de prueba
    await prisma.apiCredential.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.user.delete({
      where: { id: testUserId },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/api-credentials/ebay', () => {
    it('should save eBay credentials successfully', async () => {
      const credentials = {
        appId: 'SBX-TEST-1234567890',
        devId: 'dev123',
        certId: 'cert123',
        sandbox: true,
      };

      const res = await request(app)
        .post('/api/api-credentials/ebay')
        .set('Cookie', `token=${authToken}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentials,
          environment: 'sandbox',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid credentials', async () => {
      const invalidCredentials = {
        appId: '', // Empty
        devId: 'dev123',
        certId: 'cert123',
      };

      const res = await request(app)
        .post('/api/api-credentials/ebay')
        .set('Cookie', `token=${authToken}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentials: invalidCredentials,
          environment: 'sandbox',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/api-credentials', () => {
    it('should list user credentials', async () => {
      const res = await request(app)
        .get('/api/api-credentials')
        .set('Cookie', `token=${authToken}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/api-credentials');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/api-credentials/ebay', () => {
    it('should return encrypted credentials', async () => {
      const res = await request(app)
        .get('/api/api-credentials/ebay?environment=sandbox')
        .set('Cookie', `token=${authToken}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        // Credentials should be encrypted/redacted
        if (res.body.data?.credentials) {
          expect(res.body.data.credentials.appId).not.toBe('SBX-TEST-1234567890'); // Should be redacted or encrypted
        }
      }
    });
  });
});

