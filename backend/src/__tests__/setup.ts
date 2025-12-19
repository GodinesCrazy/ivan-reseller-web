// Test setup file
// ✅ CRITICAL: Set flags BEFORE any imports to prevent side-effects
process.env.NODE_ENV = 'test';
process.env.FX_AUTO_REFRESH_ENABLED = 'false';
process.env.USAGE_TRACKING_ENABLED = 'false';
process.env.AUTOMATION_ENGINE_ENABLED = 'false';

// Set test environment variables
process.env.JWT_SECRET = 'test-jwt-secret-key-32-chars-minimum-required';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-minimum-required';

// ✅ TEST FIX: Only mock Prisma for unit tests, not integration tests
// Integration tests need real Prisma to work with database
const isIntegrationTest = process.env.TEST_TYPE === 'integration' || 
  process.argv.some(arg => arg.includes('integration'));

if (!isIntegrationTest) {
  // Mock Prisma Client for unit tests only
  jest.mock('../config/database', () => ({
    prisma: {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    } as unknown as any,
  }));
}

