import { Request, Response } from 'express';
import { AmazonService, AmazonCredentials } from '../../services/amazon.service';
import { AppError } from '../../middleware/error.middleware';

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