// ✅ E6: Tests unitarios para ProductService
import { ProductService } from '../../services/product.service';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware';

// Mock Prisma
jest.mock('../../config/database', () => ({
  prisma: {
    product: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    activity: {
      create: jest.fn(),
    },
    sale: {
      count: jest.fn(),
    },
  },
}));

describe('ProductService', () => {
  let productService: ProductService;

  beforeEach(() => {
    productService = new ProductService();
    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    it('should create a product successfully', async () => {
      const userId = 1;
      const productData = {
        title: 'Test Product',
        aliexpressUrl: 'https://aliexpress.com/item/123',
        aliexpressPrice: 10.99,
        suggestedPrice: 19.99,
      };

      const { prisma } = require('../../config/database');
      const mockProduct = {
        id: 1,
        userId,
        ...productData,
        status: 'PENDING',
        createdAt: new Date(),
      };

      prisma.product.create.mockResolvedValue(mockProduct);
      prisma.activity.create.mockResolvedValue({});

      const result = await productService.createProduct(userId, productData);

      expect(result).toEqual(mockProduct);
      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            title: productData.title,
            aliexpressUrl: productData.aliexpressUrl,
          }),
        })
      );
    });

    it('should validate required fields', async () => {
      const userId = 1;
      const invalidData = {
        title: '', // Empty title
        aliexpressUrl: 'invalid-url',
        aliexpressPrice: -10, // Negative price
      };

      await expect(
        productService.createProduct(userId, invalidData as any)
      ).rejects.toThrow();
    });
  });

  describe('getProducts', () => {
    it('should filter products by userId', async () => {
      const userId = 1;
      const mockProducts = [
        { id: 1, userId: 1, title: 'Product 1' },
        { id: 2, userId: 1, title: 'Product 2' },
      ];

      const { prisma } = require('../../config/database');
      prisma.product.findMany.mockResolvedValue(mockProducts);

      const result = await productService.getProducts(userId);

      expect(result).toEqual(mockProducts);
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
        })
      );
    });

    it('should allow admin to see all products', async () => {
      const mockProducts = [
        { id: 1, userId: 1, title: 'Product 1' },
        { id: 2, userId: 2, title: 'Product 2' },
      ];

      const { prisma } = require('../../config/database');
      prisma.product.findMany.mockResolvedValue(mockProducts);

      const result = await productService.getProducts(undefined);

      expect(result).toEqual(mockProducts);
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        })
      );
    });
  });

  describe('getProductById', () => {
    it('should throw error if product not found', async () => {
      const { prisma } = require('../../config/database');
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(productService.getProductById(999)).rejects.toThrow(
        AppError
      );
    });

    it('should validate ownership for non-admin users', async () => {
      const productId = 1;
      const userId = 1;
      const mockProduct = {
        id: productId,
        userId: 2, // Different user
        title: 'Product',
      };

      const { prisma } = require('../../config/database');
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      await expect(
        productService.getProductById(productId, userId, false)
      ).rejects.toThrow('No tienes permiso');
    });

    it('should allow admin to see any product', async () => {
      const productId = 1;
      const adminId = 99;
      const mockProduct = {
        id: productId,
        userId: 1, // Different user
        title: 'Product',
      };

      const { prisma } = require('../../config/database');
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      const result = await productService.getProductById(productId, adminId, true);

      expect(result).toEqual(mockProduct);
    });
  });

  describe('updateProductStatusSafely - PUBLISHED consistency', () => {
    it('should set isPublished=true when status is PUBLISHED', async () => {
      const productId = 1;
      const userId = 1;
      const currentProduct = {
        id: productId,
        userId,
        status: 'APPROVED',
        isPublished: false,
        publishedAt: null,
        title: 'Test',
      };
      const updatedProduct = {
        ...currentProduct,
        status: 'PUBLISHED',
        isPublished: true,
        publishedAt: new Date(),
      };

      const { prisma } = require('../../config/database');
      prisma.product.findUnique.mockResolvedValue(currentProduct);
      prisma.product.update.mockResolvedValue(updatedProduct);

      await productService.updateProductStatusSafely(
        productId,
        'PUBLISHED',
        true,
        userId
      );

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: productId },
          data: expect.objectContaining({
            status: 'PUBLISHED',
            isPublished: true,
          }),
        })
      );
    });

    it('should enforce isPublished=true for PUBLISHED even if passed false', async () => {
      const productId = 1;
      const currentProduct = {
        id: productId,
        userId: 1,
        status: 'APPROVED',
        isPublished: false,
        publishedAt: null,
        title: 'Test',
      };

      const { prisma } = require('../../config/database');
      prisma.product.findUnique.mockResolvedValue(currentProduct);
      prisma.product.update.mockImplementation((args: any) =>
        Promise.resolve({ ...currentProduct, ...args.data })
      );

      await productService.updateProductStatusSafely(productId, 'PUBLISHED', false, 1);

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PUBLISHED',
            isPublished: true,
          }),
        })
      );
    });
  });
});

