// @ts-nocheck
import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { productService } from '../../services/product.service';
import { MarketplaceService } from '../../services/marketplace.service';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate);

// POST /api/publisher/add_for_approval
router.post('/add_for_approval', async (req: Request, res: Response) => {
  try {
    const { aliexpressUrl, scrape, ...data } = req.body || {};
    let product: any;
    if (scrape && aliexpressUrl) {
      product = await productService.createProductFromAliExpress(req.user!.userId, String(aliexpressUrl), data);
    } else {
      if (!aliexpressUrl || !data?.aliexpressPrice || !data?.suggestedPrice || !data?.title) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }
      product = await productService.createProduct(req.user!.userId, { aliexpressUrl, ...data });
    }
    return res.status(201).json({ success: true, data: product });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to add product' });
  }
});

// GET /api/publisher/pending
// ✅ MEJORADO: Incluye información de productos pendientes de aprobación
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    
    // Admin puede ver todos los productos pendientes, usuarios solo los suyos
    const items = await productService.getProducts(isAdmin ? undefined : userId, 'PENDING');
    
    // ✅ Enriquecer con información adicional
    const enrichedItems = await Promise.all(
      items.map(async (item: any) => {
        try {
          const productData = item.productData ? JSON.parse(item.productData) : {};
          return {
            ...item,
            source: productData.source || 'manual',
            queuedAt: productData.queuedAt || item.createdAt,
            queuedBy: productData.queuedBy || 'user',
            estimatedCost: productData.estimatedCost || item.aliexpressPrice,
            estimatedProfit: productData.estimatedProfit || (item.suggestedPrice - item.aliexpressPrice),
            estimatedROI: productData.estimatedROI || 
              ((item.suggestedPrice - item.aliexpressPrice) / item.aliexpressPrice * 100)
          };
        } catch {
          return item;
        }
      })
    );
    
    return res.json({ 
      success: true, 
      items: enrichedItems, 
      count: enrichedItems.length 
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to list pending' });
  }
});

// GET /api/publisher/listings
router.get('/listings', async (req: Request, res: Response) => {
  try {
    const listings = await prisma.marketplaceListing.findMany({
      where: { userId: req.user!.userId },
      orderBy: { publishedAt: 'desc' },
    });
    return res.json({ success: true, items: listings, count: listings.length });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to list listings' });
  }
});

// POST /api/publisher/approve/:id
// ✅ MEJORADO: Usa ambiente del usuario y mejor logging
router.post('/approve/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { marketplaces = [], customData, environment } = req.body || {};

    const product = await productService.getProductById(id);
    
    // ✅ Obtener ambiente del usuario si no se proporciona
    const { workflowConfigService } = await import('../../services/workflow-config.service');
    const userEnvironment = environment || await workflowConfigService.getUserEnvironment(product.userId);
    
    await productService.updateProductStatus(id, 'APPROVED', req.user!.userId);

    let publishResults: any[] = [];
    if (Array.isArray(marketplaces) && marketplaces.length > 0) {
      const service = new MarketplaceService();
      // ✅ Usar ambiente del usuario al publicar
      publishResults = await service.publishToMultipleMarketplaces(
        product.userId, 
        (product as any).id, 
        marketplaces,
        userEnvironment
      );

      const anySuccess = publishResults.some(r => r.success);
      if (anySuccess) {
        await prisma.product.update({ 
          where: { id }, 
          data: { 
            isPublished: true, 
            publishedAt: new Date(), 
            status: 'PUBLISHED',
            productData: JSON.stringify({
              ...(product.productData ? JSON.parse(product.productData) : {}),
              approvedAt: new Date().toISOString(),
              approvedBy: req.user!.userId,
              publishedEnvironment: userEnvironment
            })
          } 
        });
      }
    }

    return res.json({ 
      success: true, 
      message: 'Product approved', 
      publishResults,
      environment: userEnvironment
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to approve' });
  }
});

export default router;
