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

  // ✅ MEJORADO: FLUJO POST-VENTA AUTOMÁTICO
  try {
    const { workflowConfigService } = await import('../../services/workflow-config.service');
    const { PayPalPayoutService } = await import('../../services/paypal-payout.service');
    const { prisma } = await import('../../config/database');
    const { logger } = await import('../../config/logger');
    const { toNumber } = await import('../../utils/decimal.utils');
    const aliexpressAutoPurchaseService = (await import('../../services/aliexpress-auto-purchase.service')).default;

    // Verificar si el flujo está en modo automático
    const purchaseMode = await workflowConfigService.getStageMode(listing.userId, 'purchase');
    
    if (purchaseMode === 'automatic') {
      logger.info('Flujo post-venta en modo automático - iniciando compra automática', {
        saleId: sale.id,
        userId: listing.userId,
        orderId
      });

      // 1. Validar capital de trabajo
      const totalCapital = await workflowConfigService.getWorkingCapital(listing.userId);
      
      const pendingOrders = await prisma.sale.findMany({
        where: {
          userId: listing.userId,
          status: { in: ['PENDING', 'PROCESSING'] }
        }
      });
      const pendingCost = pendingOrders.reduce((sum, order) => 
        sum + toNumber(order.aliexpressCost || 0), 0
      );

      const approvedProducts = await prisma.product.findMany({
        where: {
          userId: listing.userId,
          status: 'APPROVED',
          isPublished: false
        }
      });
      const approvedCost = approvedProducts.reduce((sum, p) => 
        sum + toNumber(p.aliexpressPrice || 0), 0
      );

      const availableCapital = totalCapital - pendingCost - approvedCost;
      const purchaseCost = toNumber(product.aliexpressPrice || 0);

      // 2. Validar saldo PayPal (si está disponible)
      // ✅ MEJORADO: Intentar usar credenciales del usuario primero, luego variables de entorno
      let paypalBalance: { available: number; currency: string } | null = null;
      try {
        let paypalService = await PayPalPayoutService.fromUserCredentials(listing.userId);
        if (!paypalService) {
          // Fallback a variables de entorno si no hay credenciales de usuario
          paypalService = PayPalPayoutService.fromEnv();
        }
        
        if (paypalService) {
          paypalBalance = await paypalService.checkPayPalBalance();
        }
      } catch (paypalError: any) {
        logger.warn('No se pudo validar saldo PayPal, continuando con validación de capital de trabajo', {
          error: paypalError.message,
          userId: listing.userId
        });
      }

      // 3. Verificar si hay suficiente capital/disponibilidad
      const capitalBuffer = Number(process.env.WORKING_CAPITAL_BUFFER || '0.20'); // 20% buffer por defecto
      const requiredCapital = purchaseCost * (1 + capitalBuffer);

      if (availableCapital < requiredCapital) {
        logger.warn('Capital insuficiente para compra automática', {
          userId: listing.userId,
          availableCapital,
          requiredCapital,
          purchaseCost,
          buffer: capitalBuffer
        });

        // Enviar notificación con link para compra manual
        await notificationService.sendToUser(listing.userId, {
          type: 'ACTION_REQUIRED',
          title: 'Compra manual requerida',
          message: `Capital insuficiente. Disponible: $${availableCapital.toFixed(2)}, Requerido: $${requiredCapital.toFixed(2)}`,
          category: 'SALE',
          priority: 'HIGH',
          data: {
            saleId: sale.id,
            orderId,
            productUrl: product.aliexpressUrl || product.sourceUrl || '',
            manualPurchaseRequired: true,
            availableCapital,
            requiredCapital
          }
        });

        // Registrar en PurchaseLog como pendiente
        try {
          await prisma.purchaseLog.create({
            data: {
              userId: listing.userId,
              saleId: sale.id,
              orderId,
              productId: product.id,
              supplierUrl: product.aliexpressUrl || product.sourceUrl || '',
              purchaseAmount: purchaseCost,
              quantity: 1,
              status: 'PENDING',
              success: false,
              capitalValidated: false,
              capitalAvailable: availableCapital,
              paypalValidated: !!paypalBalance,
              errorMessage: `Capital insuficiente: disponible $${availableCapital.toFixed(2)}, requerido $${requiredCapital.toFixed(2)}`,
              retryAttempt: 0,
              maxRetries: 0
            }
          });
        } catch (logError) {
          logger.error('Error creando PurchaseLog', { error: logError });
        }
      } else if (paypalBalance && paypalBalance.available < requiredCapital) {
        logger.warn('Saldo PayPal insuficiente para compra automática', {
          userId: listing.userId,
          paypalBalance: paypalBalance.available,
          requiredCapital
        });

        // Similar a capital insuficiente
        await notificationService.sendToUser(listing.userId, {
          type: 'ACTION_REQUIRED',
          title: 'Saldo PayPal insuficiente',
          message: `Saldo PayPal: $${paypalBalance.available.toFixed(2)}, Requerido: $${requiredCapital.toFixed(2)}`,
          category: 'SALE',
          priority: 'HIGH',
          data: {
            saleId: sale.id,
            orderId,
            productUrl: product.aliexpressUrl || product.sourceUrl || '',
            manualPurchaseRequired: true
          }
        });
      } else {
        // 4. Ejecutar compra automática
        logger.info('Ejecutando compra automática', {
          saleId: sale.id,
          userId: listing.userId,
          productUrl: product.aliexpressUrl || product.sourceUrl,
          purchaseCost
        });

        // Parsear dirección de envío
        let shippingAddressObj: any = null;
        try {
          if (shippingAddressStr) {
            shippingAddressObj = typeof shippingAddressStr === 'string' 
              ? JSON.parse(shippingAddressStr) 
              : shippingAddressStr;
          }
        } catch (parseError) {
          logger.warn('Error parseando dirección de envío', { error: parseError });
        }

        // Preparar datos de compra
        const purchaseRequest = {
          productUrl: product.aliexpressUrl || product.sourceUrl || '',
          quantity: 1,
          maxPrice: purchaseCost * 1.1, // 10% de margen para variaciones de precio
          shippingAddress: shippingAddressObj || {
            fullName: buyerName || 'Buyer',
            addressLine1: 'Address not provided',
            city: 'City not provided',
            state: 'State not provided',
            zipCode: '00000',
            country: 'US',
            phoneNumber: '0000000000'
          },
          notes: `Order ${orderId} - Buyer: ${buyerEmail || buyerName || 'N/A'}`
        };

        // Registrar intento en PurchaseLog
        let purchaseLogId: number | null = null;
        try {
          const purchaseLog = await prisma.purchaseLog.create({
            data: {
              userId: listing.userId,
              saleId: sale.id,
              orderId,
              productId: product.id,
              supplierUrl: purchaseRequest.productUrl,
              purchaseAmount: purchaseCost,
              quantity: 1,
              status: 'PROCESSING',
              success: false,
              capitalValidated: true,
              capitalAvailable: availableCapital,
              paypalValidated: !!paypalBalance,
              retryAttempt: 0,
              maxRetries: 3
            }
          });
          purchaseLogId = purchaseLog.id;
        } catch (logError) {
          logger.error('Error creando PurchaseLog', { error: logError });
        }

        // Ejecutar compra
        try {
          const purchaseResult = await aliexpressAutoPurchaseService.executePurchase(purchaseRequest, listing.userId);

          if (purchaseResult.success && purchaseLogId) {
            await prisma.purchaseLog.update({
              where: { id: purchaseLogId },
              data: {
                status: 'SUCCESS',
                success: true,
                supplierOrderId: purchaseResult.orderNumber || purchaseResult.orderId,
                trackingNumber: purchaseResult.trackingNumber,
                completedAt: new Date()
              }
            });

            // Actualizar estado de la venta
            await prisma.sale.update({
              where: { id: sale.id },
              data: { status: 'PROCESSING' }
            });

            // Notificar éxito
            await notificationService.sendToUser(listing.userId, {
              type: 'PURCHASE_COMPLETED',
              title: 'Compra automática completada',
              message: `Orden ${orderId} procesada. Tracking: ${purchaseResult.trackingNumber || 'Pendiente'}`,
              category: 'SALE',
              priority: 'MEDIUM',
              data: {
                saleId: sale.id,
                orderId,
                supplierOrderId: purchaseResult.orderNumber || purchaseResult.orderId,
                trackingNumber: purchaseResult.trackingNumber
              }
            });
          } else {
            throw new Error(purchaseResult.error || 'Compra falló sin razón específica');
          }
        } catch (purchaseError: any) {
          logger.error('Error ejecutando compra automática', {
            error: purchaseError.message,
            saleId: sale.id,
            userId: listing.userId
          });

          if (purchaseLogId) {
            await prisma.purchaseLog.update({
              where: { id: purchaseLogId },
              data: {
                status: 'FAILED',
                success: false,
                errorMessage: purchaseError.message,
                completedAt: new Date()
              }
            });
          }

          // Notificar error y enviar link para compra manual
          await notificationService.sendToUser(listing.userId, {
            type: 'PURCHASE_FAILED',
            title: 'Compra automática falló',
            message: `Error: ${purchaseError.message}. Requiere acción manual.`,
            category: 'SALE',
            priority: 'HIGH',
            data: {
              saleId: sale.id,
              orderId,
              productUrl: purchaseRequest.productUrl,
              manualPurchaseRequired: true,
              error: purchaseError.message
            }
          });
        }
      }
    } else {
      // Modo manual: solo notificar con link para compra manual
      logger.info('Flujo post-venta en modo manual', {
        saleId: sale.id,
        userId: listing.userId
      });

      await notificationService.sendToUser(listing.userId, {
        type: 'ACTION_REQUIRED',
        title: 'Compra manual requerida',
        message: `Nueva venta recibida. Orden ${orderId} requiere procesamiento manual.`,
        category: 'SALE',
        priority: 'HIGH',
        data: {
          saleId: sale.id,
          orderId,
          productUrl: product.aliexpressUrl || product.sourceUrl || '',
          manualPurchaseRequired: true,
          buyerEmail,
          shippingAddress: shippingAddressStr
        }
      });
    }
  } catch (postSaleError: any) {
    // No fallar la creación de la venta si hay error en el flujo post-venta
    logger.error('Error en flujo post-venta', {
      error: postSaleError.message,
      saleId: sale.id,
      userId: listing.userId
    });
  }

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

