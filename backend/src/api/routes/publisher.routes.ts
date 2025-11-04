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
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const items = await productService.getProducts(req.user!.userId, 'PENDING');
    return res.json({ success: true, items, count: items.length });
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
router.post('/approve/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { marketplaces = [], customData } = req.body || {};

    const product = await productService.getProductById(id);
    await productService.updateProductStatus(id, 'APPROVED', req.user!.userId);

    let publishResults: any[] = [];
    if (Array.isArray(marketplaces) && marketplaces.length > 0) {
      const service = new MarketplaceService();
      publishResults = await service.publishToMultipleMarketplaces(product.userId, (product as any).id, marketplaces);

      const anySuccess = publishResults.some(r => r.success);
      if (anySuccess) {
        await prisma.product.update({ where: { id }, data: { isPublished: true, publishedAt: new Date(), status: 'PUBLISHED' } });
      }
    }

    return res.json({ success: true, message: 'Product approved', publishResults });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to approve' });
  }
});

export default router;
