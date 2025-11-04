import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import amazonController from '../controllers/amazon.controller';
import { z } from 'zod';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Validation schemas
const credentialsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  refreshToken: z.string(),
  region: z.enum(['us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1']),
  marketplace: z.enum(['ATVPDKIKX0DER', 'A2EUQ1WTGCTBG2', 'A1AM78C64UM0Y8', 'A1VC38T7YXB528']),
});

const inventoryUpdateSchema = z.object({
  sku: z.string(),
  quantity: z.number().min(0),
});

// Validation middleware
const validateCredentials = (req: any, res: any, next: any) => {
  try {
    credentialsSchema.parse(req.body);
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid credentials format',
      details: error.errors,
    });
  }
};

const validateInventoryUpdate = (req: any, res: any, next: any) => {
  try {
    inventoryUpdateSchema.parse(req.body);
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid inventory update format',
      details: error.errors,
    });
  }
};

/**
 * @swagger
 * /api/amazon/credentials:
 *   post:
 *     tags: [Amazon]
 *     summary: Configure Amazon SP-API credentials
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientId
 *               - clientSecret
 *               - refreshToken
 *               - region
 *               - marketplace
 *             properties:
 *               clientId:
 *                 type: string
 *                 description: Amazon SP-API Client ID
 *               clientSecret:
 *                 type: string
 *                 description: Amazon SP-API Client Secret
 *               refreshToken:
 *                 type: string
 *                 description: LWA Refresh Token
 *               region:
 *                 type: string
 *                 enum: [us-east-1, us-west-2, eu-west-1, ap-northeast-1]
 *               marketplace:
 *                 type: string
 *                 enum: [ATVPDKIKX0DER, A2EUQ1WTGCTBG2, A1AM78C64UM0Y8, A1VC38T7YXB528]
 *     responses:
 *       200:
 *         description: Credentials configured successfully
 *       400:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post('/credentials', validateCredentials, amazonController.setCredentials);

/**
 * @swagger
 * /api/amazon/test-connection:
 *   get:
 *     tags: [Amazon]
 *     summary: Test Amazon SP-API connection
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.get('/test-connection', amazonController.testConnection);

/**
 * @swagger
 * /api/amazon/categories:
 *   get:
 *     tags: [Amazon]
 *     summary: Get product categories by search term
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term for category lookup
 *     responses:
 *       200:
 *         description: Categories found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/categories', amazonController.getCategories);

/**
 * @swagger
 * /api/amazon/products/search:
 *   get:
 *     tags: [Amazon]
 *     summary: Search products on Amazon
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Product search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: Products found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/products/search', amazonController.searchProducts);

/**
 * @swagger
 * /api/amazon/inventory:
 *   get:
 *     tags: [Amazon]
 *     summary: Get inventory summary from Amazon
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 inventory:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/inventory', amazonController.getInventory);

/**
 * @swagger
 * /api/amazon/inventory:
 *   put:
 *     tags: [Amazon]
 *     summary: Update inventory quantity
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sku
 *               - quantity
 *             properties:
 *               sku:
 *                 type: string
 *                 description: Product SKU
 *               quantity:
 *                 type: number
 *                 minimum: 0
 *                 description: New quantity
 *     responses:
 *       200:
 *         description: Inventory updated successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.put('/inventory', validateInventoryUpdate, amazonController.updateInventory);

/**
 * @swagger
 * /api/amazon/marketplace/{marketplace}/config:
 *   get:
 *     tags: [Amazon]
 *     summary: Get marketplace configuration
 *     parameters:
 *       - in: path
 *         name: marketplace
 *         required: true
 *         schema:
 *           type: string
 *           enum: [US, CA, UK, DE, JP]
 *         description: Marketplace code
 *     responses:
 *       200:
 *         description: Marketplace configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 config:
 *                   type: object
 */
router.get('/marketplace/:marketplace/config', amazonController.getMarketplaceConfig);

export default router;