// Test setup file
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client for tests
jest.mock('../config/database', () => ({
  prisma: {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  } as unknown as PrismaClient,
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-32-chars-minimum-required';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-minimum-required';

