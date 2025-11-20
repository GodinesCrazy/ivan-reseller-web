import { Request, Response } from 'express';
import { AmazonService, AmazonCredentials } from '../../services/amazon.service';
import { AppError } from '../../middleware/error.middleware';
import { z } from 'zod';

export class AmazonController {
  private amazonService: AmazonService;

  constructor() {
    this.amazonService = new AmazonService();
  }

  /**
   * Configure Amazon SP-API credentials
   */
  async setCredentials(req: Request, res: Response): Promise<void> {
    try {
      const credentials: AmazonCredentials = req.body;
      
      // Validate required fields
      if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
        throw new AppError('Missing required Amazon credentials', 400);
      }

      await this.amazonService.setCredentials(credentials);

      res.json({
        success: true,
        message: 'Amazon credentials configured successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Test Amazon connection
   */
  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const isConnected = await this.amazonService.testConnection();
      
      res.json({
        success: isConnected,
        message: isConnected ? 'Amazon connection successful' : 'Amazon connection failed',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get product categories
   */
  async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const { searchTerm } = req.query;
      
      if (!searchTerm || typeof searchTerm !== 'string') {
        throw new AppError('Search term is required', 400);
      }

      const categories = await this.amazonService.getProductCategories(searchTerm);
      
      res.json({
        success: true,
        categories,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Search products on Amazon
   */
  async searchProducts(req: Request, res: Response): Promise<void> {
    try {
      const { query, limit } = req.query;
      
      if (!query || typeof query !== 'string') {
        throw new AppError('Search query is required', 400);
      }

      const searchLimit = limit ? parseInt(limit as string) : 10;
      const products = await this.amazonService.searchProducts(query, searchLimit);
      
      res.json({
        success: true,
        products,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get inventory summary
   */
  async getInventory(req: Request, res: Response): Promise<void> {
    try {
      const inventory = await this.amazonService.getInventorySummary();
      
      res.json({
        success: true,
        inventory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update listing price
   */
  async updatePrice(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        sku: z.string().min(1),
        price: z.number().positive(),
        currency: z.string().optional(),
      });
      const { sku, price, currency } = schema.parse(req.body);

      const success = await this.amazonService.updatePrice(sku, price, currency);

      res.json({
        success,
        message: success ? 'Price updated successfully' : 'Failed to update price',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get seller listings
   */
  async getListings(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        nextToken: z.string().optional(),
      });
      const { limit, nextToken } = schema.parse(req.query);

      const result = await this.amazonService.getMyListings(limit, nextToken);

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Create listing (basic path using Feeds)
   */
  async createListing(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        sku: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        price: z.number().positive(),
        currency: z.string().min(3).max(3).default('USD'),
        quantity: z.number().int().min(0),
        images: z.array(z.string().url()).default([]),
        category: z.string().optional().default(''),
        brand: z.string().optional(),
        manufacturer: z.string().optional(),
        attributes: z.record(z.any()).default({}),
      });

      const payload = schema.parse(req.body);
      const result = await this.amazonService.createListing({
        ...payload,
        attributes: payload.attributes,
        dimensions: undefined,
      } as any);

      res.json({
        success: result.success,
        result,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
  /**
   * Update inventory quantity
   */
  async updateInventory(req: Request, res: Response): Promise<void> {
    try {
      const { sku, quantity } = req.body;
      
      if (!sku || typeof quantity !== 'number') {
        throw new AppError('SKU and quantity are required', 400);
      }

      const success = await this.amazonService.updateInventoryQuantity(sku, quantity);
      
      res.json({
        success,
        message: success ? 'Inventory updated successfully' : 'Failed to update inventory',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * ✅ A4: Update multiple prices in bulk
   */
  async updatePricesBulk(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        updates: z.array(z.object({
          sku: z.string().min(1),
          price: z.number().positive(),
          currency: z.string().optional(),
        })).min(1).max(100),
      });
      const parsed = schema.parse(req.body);
      const updates = parsed.updates as Array<{ sku: string; price: number; currency?: string }>;

      const result = await this.amazonService.updatePricesBulk(updates);

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * ✅ A4: Update multiple inventory quantities in bulk
   */
  async updateInventoryBulk(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        updates: z.array(z.object({
          sku: z.string().min(1),
          quantity: z.number().int().min(0),
        })).min(1).max(100),
      });
      const parsed = schema.parse(req.body);
      const updates = parsed.updates as Array<{ sku: string; quantity: number }>;

      const result = await this.amazonService.updateInventoryBulk(updates);

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * ✅ A4: Get orders from Amazon
   */
  async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        createdAfter: z.string().datetime().optional(),
        createdBefore: z.string().datetime().optional(),
        lastUpdatedAfter: z.string().datetime().optional(),
        lastUpdatedBefore: z.string().datetime().optional(),
        orderStatuses: z.array(z.string()).optional(),
        fulfillmentChannels: z.array(z.string()).optional(),
        paymentMethods: z.array(z.string()).optional(),
        maxResultsPerPage: z.coerce.number().int().min(1).max(100).default(20),
        nextToken: z.string().optional(),
      });
      const params = schema.parse(req.query);

      const result = await this.amazonService.getOrders({
        ...params,
        createdAfter: params.createdAfter ? new Date(params.createdAfter) : undefined,
        createdBefore: params.createdBefore ? new Date(params.createdBefore) : undefined,
        lastUpdatedAfter: params.lastUpdatedAfter ? new Date(params.lastUpdatedAfter) : undefined,
        lastUpdatedBefore: params.lastUpdatedBefore ? new Date(params.lastUpdatedBefore) : undefined,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid query parameters', details: error.errors });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * ✅ A4: Get specific order by order ID
   */
  async getOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      
      if (!orderId) {
        throw new AppError('Order ID is required', 400);
      }

      const order = await this.amazonService.getOrder(orderId);

      if (!order) {
        res.status(404).json({
          success: false,
          error: 'Order not found',
        });
        return;
      }

      res.json({
        success: true,
        order,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * ✅ A4: Get order items for a specific order
   */
  async getOrderItems(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      
      if (!orderId) {
        throw new AppError('Order ID is required', 400);
      }

      const items = await this.amazonService.getOrderItems(orderId);

      res.json({
        success: true,
        items,
        count: items.length,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * ✅ A4: Update listing
   */
  async updateListing(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        sku: z.string().min(1),
        title: z.string().optional(),
        description: z.string().optional(),
        price: z.number().positive().optional(),
        quantity: z.number().int().min(0).optional(),
        images: z.array(z.string().url()).optional(),
      });
      const { sku, ...updates } = schema.parse(req.body);

      const success = await this.amazonService.updateListing(sku, updates);

      res.json({
        success,
        message: success ? 'Listing updated successfully' : 'Failed to update listing',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * ✅ A4: Delete listing
   */
  async deleteListing(req: Request, res: Response): Promise<void> {
    try {
      const { sku } = req.params;
      
      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      const success = await this.amazonService.deleteListing(sku);

      res.json({
        success,
        message: success ? 'Listing deleted successfully' : 'Failed to delete listing',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * ✅ A4: Get listing by SKU
   */
  async getListingBySku(req: Request, res: Response): Promise<void> {
    try {
      const { sku } = req.params;
      
      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      const listing = await this.amazonService.getListingBySku(sku);

      if (!listing) {
        res.status(404).json({
          success: false,
          error: 'Listing not found',
        });
        return;
      }

      res.json({
        success: true,
        listing,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get marketplace configuration for different Amazon regions
   */
  async getMarketplaceConfig(req: Request, res: Response): Promise<void> {
    try {
      const { marketplace } = req.params;
      
      const config = AmazonService.getMarketplaceConfig(marketplace.toUpperCase());
      
      res.json({
        success: true,
        config,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new AmazonController();