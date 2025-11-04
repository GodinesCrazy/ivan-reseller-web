import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import costCalculator from '../../services/cost-calculator.service';
import { notificationService } from '../../services/notification.service';

const router = Router();

async function recordSaleFromWebhook(params: {
  marketplace: 'ebay' | 'mercadolibre' | 'amazon';
  listingId: string;
  orderId?: string;
  amount?: number;
  buyer?: string;
  shipping?: string;
}) {
  const { marketplace, listingId } = params;
  const listing = await prisma.marketplaceListing.findFirst({ where: { marketplace, listingId } });
  if (!listing) throw new Error('Listing not found');

  const product = await prisma.product.findUnique({ where: { id: listing.productId } });
  if (!product) throw new Error('Product not found');
  const user = await prisma.user.findUnique({ where: { id: listing.userId } });
  if (!user) throw new Error('User not found');

  const salePrice = Number(params.amount || product.suggestedPrice || 0);
  if (!isFinite(salePrice) || salePrice <= 0) throw new Error('Invalid amount');

  const aliexpressCost = Number(product.aliexpressPrice || 0);
  const { breakdown } = costCalculator.calculate(marketplace, salePrice, aliexpressCost);
  const marketplaceFee = breakdown.marketplaceFee;
  const grossProfit = salePrice - aliexpressCost - marketplaceFee;
  const commissionAmount = grossProfit * (Number(user.commissionRate || 0.1));
  const netProfit = grossProfit - commissionAmount;

  const orderId = params.orderId || `${marketplace.toUpperCase()}-${Date.now()}-${Math.floor(Math.random()*1000)}`;

  const sale = await prisma.sale.create({
    data: {
      userId: listing.userId,
      productId: listing.productId,
      orderId,
      marketplace,
      salePrice,
      aliexpressCost,
      marketplaceFee,
      grossProfit,
      commissionAmount,
      netProfit,
      status: 'PENDING',
    },
  });

  // Create commission record
  await prisma.commission.create({ data: { userId: listing.userId, saleId: sale.id, amount: commissionAmount } });

  // Notify user via WS notifications
  notificationService.sendToUser(listing.userId, {
    type: 'SALE_CREATED',
    title: 'Nueva venta recibida',
    message: `Orden ${orderId} en ${marketplace} por $${salePrice.toFixed(2)}`,
    category: 'SALE',
    priority: 'HIGH',
    data: { orderId, listingId, marketplace, amount: salePrice, buyer: params.buyer, shipping: params.shipping },
  });

  return sale;
}

router.post('/mercadolibre', async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const listingId = body.listingId || body.resourceId || body?.order?.order_items?.[0]?.item?.id || body?.order_items?.[0]?.item?.id;
    const amount = Number(body.amount || body.total_amount || body?.order?.total_amount || body?.order_items?.[0]?.unit_price);
    const orderId = String(body.id || body.order_id || body.resource || '');
    const buyer = body?.buyer?.nickname || body?.buyer?.email;
    const shipping = body?.shipping?.receiver_address?.address_line;
    if (!listingId) return res.status(400).json({ success: false, error: 'listingId missing' });
    await recordSaleFromWebhook({ marketplace: 'mercadolibre', listingId, amount, orderId, buyer, shipping });
    res.json({ success: true });
  } catch (e: any) {
    res.status(200).json({ success: true }); // 200 to avoid retries storm; log internally
  }
});

router.post('/ebay', async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const listingId = body.listingId || body.itemId || body?.transaction?.itemId;
    const amount = Number(body.amount || body.total || body?.transaction?.amountPaid || body?.transaction?.transactionPrice?.value);
    const orderId = String(body.orderId || body.id || body?.transaction?.orderId || '');
    const buyer = body?.buyer?.username || body?.transaction?.buyer?.username;
    if (!listingId) return res.status(400).json({ success: false, error: 'listingId missing' });
    await recordSaleFromWebhook({ marketplace: 'ebay', listingId, amount, orderId, buyer });
    res.json({ success: true });
  } catch (e: any) {
    res.status(200).json({ success: true });
  }
});

export default router;

