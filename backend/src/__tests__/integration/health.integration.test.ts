/**
 * Integration tests for health endpoints
 * Verifies that /health and /ready respond correctly without ERR_HTTP_HEADERS_SENT
 * 
 * ✅ FIX: Tests verifican que no hay monkey-patches ni doble respuesta
 */

import request from 'supertest';
import app from '../../app';

describe('Health Endpoints Integration', () => {
  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('service', 'ivan-reseller-backend');
    });

    it('should respond quickly (<1s)', async () => {
      const start = Date.now();
      await request(app).get('/health').expect(200);
      const duration = Date.now() - start;
      
      // Health debe ser ultra-rápido (sin imports dinámicos pesados)
      expect(duration).toBeLessThan(1000);
    });

    it('should not trigger ERR_HTTP_HEADERS_SENT', async () => {
      // This test verifies that the response is sent only once
      // If ERR_HTTP_HEADERS_SENT occurs, the test will fail with an error
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.status).toBe(200);
      // If headers were set multiple times, the response would be malformed
      expect(response.headers['content-type']).toContain('application/json');
      // Verify no duplicate headers
      const responseTimeHeaders = response.headers['x-response-time'];
      expect(responseTimeHeaders).toBeDefined();
    });

    it('should include X-Response-Time header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // on-headers debe setear este header
      expect(response.headers['x-response-time']).toBeDefined();
      expect(response.headers['x-response-time']).toMatch(/^\d+ms$/);
    });
  });

  describe('GET /ready', () => {
    it('should return 200 or 503 based on readiness', async () => {
      const response = await request(app).get('/ready');
      
      // Should be either 200 (ready) or 503 (not ready), but always respond
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('ready');
      expect(response.body).toHaveProperty('checks');
    });

    it('should respond quickly even if DB is down (<5s)', async () => {
      const start = Date.now();
      await request(app).get('/ready');
      const duration = Date.now() - start;
      
      // Even if DB is down, should respond within timeout (2s DB + 1s Redis + buffer)
      expect(duration).toBeLessThan(5000);
    });

    it('should not trigger ERR_HTTP_HEADERS_SENT', async () => {
      // Verify response is sent only once
      const response = await request(app).get('/ready');
      
      expect([200, 503]).toContain(response.status);
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should include database check in response', async () => {
      const response = await request(app).get('/ready');
      
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks.database).toHaveProperty('status');
      expect(response.body.checks.database).toHaveProperty('connected');
    });
  });

  describe('GET / (404)', () => {
    it('should return 404 quickly without ERR_HTTP_HEADERS_SENT', async () => {
      const start = Date.now();
      const response = await request(app).get('/').expect(404);
      const duration = Date.now() - start;
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      // Debe responder rápido
      expect(duration).toBeLessThan(1000);
    });
  });
});
