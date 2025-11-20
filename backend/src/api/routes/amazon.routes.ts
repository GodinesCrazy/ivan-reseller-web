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
 * /api/amazon/price:
 *   patch:
 *     tags: [Amazon]
 *     summary: Update listing price
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sku, price]
 *             properties:
 *               sku:
 *                 type: string
 *               price:
 *                 type: number
 *               currency:
 *                 type: string
 *                 description: Currency code (default USD)
 *     responses:
 *       200:
 *         description: Price update result
 */
router.patch('/price', amazonController.updatePrice);

/**
 * @swagger
 * /api/amazon/listings:
 *   get:
 *     tags: [Amazon]
 *     summary: Get seller listings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: nextToken
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Listings
 */
router.get('/listings', amazonController.getListings);

/**
 * @swagger
 * /api/amazon/listings:
 *   post:
 *     tags: [Amazon]
 *     summary: Create a product listing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sku, title, description, price, quantity]
 *             properties:
 *               sku: { type: string }
 *               title: { type: string }
 *               description: { type: string }
 *               price: { type: number }
 *               currency: { type: string }
 *               quantity: { type: integer }
 *               images: { type: array, items: { type: string, format: uri } }
 *               category: { type: string }
 *               brand: { type: string }
 *               manufacturer: { type: string }
 *               attributes: { type: object, additionalProperties: true }
 *     responses:
 *       200:
 *         description: Listing created
 */
router.post('/listings', amazonController.createListing);

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

/**
 * @swagger
 * /api/amazon/prices/bulk:
 *   patch:
 *     tags: [Amazon]
 *     summary: Update multiple prices in bulk
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [updates]
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [sku, price]
 *                   properties:
 *                     sku: { type: string }
 *                     price: { type: number }
 *                     currency: { type: string }
 *     responses:
 *       200:
 *         description: Bulk price update result
 */
router.patch('/prices/bulk', amazonController.updatePricesBulk);

/**
 * @swagger
 * /api/amazon/inventory/bulk:
 *   put:
 *     tags: [Amazon]
 *     summary: Update multiple inventory quantities in bulk
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [updates]
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [sku, quantity]
 *                   properties:
 *                     sku: { type: string }
 *                     quantity: { type: number, minimum: 0 }
 *     responses:
 *       200:
 *         description: Bulk inventory update result
 */
router.put('/inventory/bulk', amazonController.updateInventoryBulk);

/**
 * @swagger
 * /api/amazon/orders:
 *   get:
 *     tags: [Amazon]
 *     summary: Get orders from Amazon
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: createdAfter
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: createdBefore
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: lastUpdatedAfter
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: lastUpdatedBefore
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: orderStatuses
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: maxResultsPerPage
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: nextToken
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 */
router.get('/orders', amazonController.getOrders);

/**
 * @swagger
 * /api/amazon/orders/{orderId}:
 *   get:
 *     tags: [Amazon]
 *     summary: Get specific order by order ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/orders/:orderId', amazonController.getOrder);

/**
 * @swagger
 * /api/amazon/orders/{orderId}/items:
 *   get:
 *     tags: [Amazon]
 *     summary: Get order items for a specific order
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order items retrieved successfully
 */
router.get('/orders/:orderId/items', amazonController.getOrderItems);

/**
 * @swagger
 * /api/amazon/listings/{sku}:
 *   get:
 *     tags: [Amazon]
 *     summary: Get listing by SKU
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Listing retrieved successfully
 *       404:
 *         description: Listing not found
 */
router.get('/listings/:sku', amazonController.getListingBySku);

/**
 * @swagger
 * /api/amazon/listings/{sku}:
 *   patch:
 *     tags: [Amazon]
 *     summary: Update listing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               price: { type: number }
 *               quantity: { type: integer }
 *               images: { type: array, items: { type: string, format: uri } }
 *     responses:
 *       200:
 *         description: Listing updated successfully
 */
router.patch('/listings/:sku', amazonController.updateListing);

/**
 * @swagger
 * /api/amazon/listings/{sku}:
 *   delete:
 *     tags: [Amazon]
 *     summary: Delete listing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Listing deleted successfully
 */
router.delete('/listings/:sku', amazonController.deleteListing);

export default router;