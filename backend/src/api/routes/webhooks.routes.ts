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
  buyerEmail?: string;
  shipping?: string;
  shippingAddress?: any; // Objeto con dirección completa
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

  // ✅ MEJORADO: Extraer y guardar información del comprador
  const buyerEmail = params.buyerEmail || (typeof params.buyer === 'string' && params.buyer.includes('@') ? params.buyer : null);
  const buyerName = params.buyer && !params.buyer.includes('@') ? params.buyer : null;
  
  // Procesar dirección de envío
  let shippingAddressStr: string | null = null;
  if (params.shippingAddress && typeof params.shippingAddress === 'object') {
    shippingAddressStr = JSON.stringify(params.shippingAddress);
  } else if (params.shipping) {
    shippingAddressStr = typeof params.shipping === 'string' ? params.shipping : JSON.stringify(params.shipping);
  }

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
      buyerEmail: buyerEmail || null, // ✅ Guardar email del comprador
      buyerName: buyerName || null, // ✅ Guardar nombre del comprador
      shippingAddress: shippingAddressStr, // ✅ Guardar dirección de envío
    },
  });

  // Create commission record
  await prisma.commission.create({ data: { userId: listing.userId, saleId: sale.id, amount: commissionAmount } });

  // ✅ MEJORADO: Notificar usuario con información completa
  await notificationService.sendToUser(listing.userId, {
    type: 'SALE_CREATED',
    title: 'Nueva venta recibida',
    message: `Orden ${orderId} en ${marketplace} por $${salePrice.toFixed(2)}`,
    category: 'SALE',
    priority: 'HIGH',
    data: { 
      orderId, 
      listingId, 
      marketplace, 
      amount: salePrice, 
      buyer: params.buyer || buyerName, 
      buyerEmail: buyerEmail,
      shipping: params.shipping || shippingAddressStr,
      productTitle: product.title,
      productId: product.id
    },
  });

  return sale;
}

router.post('/mercadolibre', async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const listingId = body.listingId || body.resourceId || body?.order?.order_items?.[0]?.item?.id || body?.order_items?.[0]?.item?.id;
    const amount = Number(body.amount || body.total_amount || body?.order?.total_amount || body?.order_items?.[0]?.unit_price);
    const orderId = String(body.id || body.order_id || body.resource || '');
    
    // ✅ MEJORADO: Extraer información completa del comprador
    const buyer = body?.buyer?.nickname || body?.buyer?.first_name || body?.buyer?.last_name || body?.buyer?.email;
    const buyerEmail = body?.buyer?.email || (body?.buyer?.nickname && body.buyer.nickname.includes('@') ? body.buyer.nickname : null);
    const buyerName = body?.buyer?.first_name && body?.buyer?.last_name 
      ? `${body.buyer.first_name} ${body.buyer.last_name}` 
      : (body?.buyer?.nickname && !body.buyer.nickname.includes('@') ? body.buyer.nickname : null);
    
    // ✅ MEJORADO: Extraer dirección completa de envío
    const receiverAddress = body?.shipping?.receiver_address || body?.order?.shipping?.receiver_address;
    const shippingAddress = receiverAddress ? {
      street: receiverAddress.address_line || receiverAddress.street_name || '',
      number: receiverAddress.street_number || '',
      city: receiverAddress.city?.name || receiverAddress.city || '',
      state: receiverAddress.state?.name || receiverAddress.state || '',
      zipCode: receiverAddress.zip_code || receiverAddress.postal_code || '',
      country: receiverAddress.country?.name || receiverAddress.country || '',
      neighborhood: receiverAddress.neighborhood?.name || receiverAddress.neighborhood || '',
    } : null;
    const shipping = receiverAddress?.address_line || body?.shipping?.receiver_address?.address_line;
    
    if (!listingId) return res.status(400).json({ success: false, error: 'listingId missing' });
    await recordSaleFromWebhook({ 
      marketplace: 'mercadolibre', 
      listingId, 
      amount, 
      orderId, 
      buyer, 
      buyerEmail,
      shipping, 
      shippingAddress 
    });
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
    
    // ✅ MEJORADO: Extraer información completa del comprador
    const buyer = body?.buyer?.username || body?.buyer?.name || body?.transaction?.buyer?.username;
    const buyerEmail = body?.buyer?.email || body?.transaction?.buyer?.email || null;
    const buyerName = body?.buyer?.name || body?.transaction?.buyer?.name || buyer;
    
    // ✅ MEJORADO: Extraer dirección completa de envío
    const shippingAddress = body?.shippingAddress || body?.transaction?.shippingAddress || body?.fulfillmentStartInstructions?.shippingStep?.shipTo ? {
      fullName: body.fulfillmentStartInstructions.shippingStep.shipTo.fullName || '',
      street: body.fulfillmentStartInstructions.shippingStep.shipTo.contactAddress?.addressLine1 || '',
      addressLine2: body.fulfillmentStartInstructions.shippingStep.shipTo.contactAddress?.addressLine2 || '',
      city: body.fulfillmentStartInstructions.shippingStep.shipTo.contactAddress?.city || '',
      state: body.fulfillmentStartInstructions.shippingStep.shipTo.contactAddress?.stateOrProvince || '',
      zipCode: body.fulfillmentStartInstructions.shippingStep.shipTo.contactAddress?.postalCode || '',
      country: body.fulfillmentStartInstructions.shippingStep.shipTo.contactAddress?.countryCode || '',
      phone: body.fulfillmentStartInstructions.shippingStep.shipTo.primaryPhone?.phoneNumber || '',
    } : null;
    
    if (!listingId) return res.status(400).json({ success: false, error: 'listingId missing' });
    await recordSaleFromWebhook({ 
      marketplace: 'ebay', 
      listingId, 
      amount, 
      orderId, 
      buyer,
      buyerEmail,
      shippingAddress 
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(200).json({ success: true });
  }
});

export default router;

