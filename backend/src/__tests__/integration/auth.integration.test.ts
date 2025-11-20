// ✅ E7: Tests de integración para Autenticación
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import bcrypt from 'bcryptjs';

describe('Authentication Integration Tests', () => {
  let testUserId: number;
  const testUser = {
    username: 'testuser_auth',
    email: 'testauth@ivanreseller.com',
    password: 'test123456',
  };

  beforeAll(async () => {
    // Limpiar usuario de prueba si existe
    await prisma.user.deleteMany({
      where: {
        OR: [
          { username: testUser.username },
          { email: testUser.email },
        ],
      },
    });
  });

  afterAll(async () => {
    // Limpiar datos de prueba
    if (testUserId) {
      await prisma.user.delete({
        where: { id: testUserId },
      });
    }
    await prisma.$disconnect();
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      // Crear usuario de prueba
      const hashedPassword = await bcrypt.hash(testUser.password, 10);
      const user = await prisma.user.create({
        data: {
          username: testUser.username,
          email: testUser.email,
          password: hashedPassword,
          role: 'USER',
          commissionRate: 0.20,
          isActive: true,
        },
      });
      testUserId = user.id;

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe(testUser.username);
    });

    it('should reject login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject login with non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should reject public registration (disabled)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          email: 'newuser@ivanreseller.com',
          password: 'password123',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Public registration is disabled');
    });
  });

  describe('Protected Routes', () => {
    let authToken: string;

    beforeAll(async () => {
      // Login para obtener token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password,
        });

      authToken = loginRes.body.token || loginRes.headers['set-cookie']?.[0]?.split('=')[1]?.split(';')[0];
    });

    it('should access protected route with valid token', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Cookie', `token=${authToken}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should reject access without token', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats');

      expect(res.status).toBe(401);
    });
  });
});

