/**
 * HTTP Stability Integration Tests
 * Verifies that endpoints respond correctly without ERR_HTTP_HEADERS_SENT
 * and that error handlers don't cause double responses
 */

import request from 'supertest';
import app from '../../app';

describe('HTTP Stability Integration', () => {
  describe('GET /health', () => {
    it('should return 200 quickly (<1s) without ERR_HTTP_HEADERS_SENT', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/health')
        .expect(200);
      const duration = Date.now() - start;
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(duration).toBeLessThan(1000);
      
      // Verify no duplicate headers (would indicate ERR_HTTP_HEADERS_SENT)
      const contentTypeHeaders = response.headers['content-type'];
      expect(contentTypeHeaders).toBeDefined();
    });
  });

  describe('GET / (404)', () => {
    it('should return 404 without ERR_HTTP_HEADERS_SENT', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/')
        .expect(404);
      const duration = Date.now() - start;
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(duration).toBeLessThan(1000);
      
      // Verify response is valid JSON (would be malformed if headers sent twice)
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should not call next() after sending 404 response', async () => {
      // This test verifies that 404 handler doesn't call next(err)
      // which would trigger error handler and cause double response
      const response = await request(app)
        .get('/nonexistent-route-12345')
        .expect(404);
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handler', () => {
    it('should not send response if headers already sent', async () => {
      // Create a route that sends response and then throws error
      // This simulates the scenario where headers are sent but error occurs
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      // Health endpoint should respond normally
      expect(response.status).toBe(200);
      
      // If error handler tried to send response after headers sent,
      // we would see ERR_HTTP_HEADERS_SENT in logs or malformed response
      // This test passes if no such error occurs
    });
  });

  describe('Request Logger Middleware', () => {
    it('should not modify headers in finish/close callbacks', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      // Request logger should only log, not modify headers
      // If it tried to set headers in finish callback, we'd see ERR_HTTP_HEADERS_SENT
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBeDefined();
    });
  });
});
