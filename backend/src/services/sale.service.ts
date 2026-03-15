import { trace } from '../utils/boot-trace';
trace('loading sale.service');

import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import logger from '../config/logger';
import fxService from './fx.service';
import { notificationService } from './notification.service';
import { UserSettingsService } from './user-settings.service';
import { platformConfigService } from './platform-config.service';
import { toNumber } from '../utils/decimal.utils';
import type { AutomatedOrder } from './automation.service';

export interface CreateSaleDto {
  orderId: string;
  productId: number; // ✅ Cambiado a number
  marketplace: string;
  salePrice: number;
  costPrice: number;
  platformFees?: number;
  shippingCost?: number; // Costo envío (en baseCurrency, se convierte a saleCurrency)
  importTax?: number;   // Impuestos importación (en baseCurrency, se convierte a saleCurrency)
  currency?: string;
  buyerEmail?: string;
  shippingAddress?: string;
  environment?: 'sandbox' | 'production';
}

export class SaleService {
  /** options.fromFulfillment: when true (e.g. from createSaleFromOrder after PURCHASED), allow creating sale even if product is INACTIVE/unpublished */
  async createSale(userId: number, data: CreateSaleDto, options?: { fromFulfillment?: boolean }) {
    // Verificar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      include: { user: true },
    });

    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // ✅ Validar estado del producto antes de crear venta (skip when creating from fulfillment - order already purchased)
    if (!options?.fromFulfillment) {
      if (product.status === 'INACTIVE' || product.status === 'REJECTED') {
        throw new AppError(`Cannot create sale for product with status: ${product.status}. Product must be approved and active.`, 400);
      }
      if (!product.isPublished && product.status !== 'APPROVED') {
        throw new AppError('Product must be published or approved before creating a sale', 400);
      }
    }

    // ✅ Validación matemática estricta (no valores por defecto 0 silenciosos)
    if (!data.salePrice || data.salePrice <= 0) {
      throw new AppError('Sale price must be greater than 0', 400);
    }
    if (!data.costPrice || data.costPrice <= 0) {
      throw new AppError('Supplier cost (costPrice) must be greater than 0', 400);
    }

    // ✅ CORREGIDO: Sincronizar monedas antes de calcular utilidades
    // Obtener moneda base del usuario
    let baseCurrency = 'USD'; // Fallback por defecto
    try {
      const userSettingsService = new UserSettingsService();
      baseCurrency = await userSettingsService.getUserBaseCurrency(userId) || 'USD';
    } catch (error) {
      logger.warn('[SALE] Failed to get user base currency, using USD fallback', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Determinar monedas de salePrice y costPrice
    // Por defecto asumir que están en baseCurrency si no se especifica
    const saleCurrency = data.currency || baseCurrency;
    const costCurrency = baseCurrency; // costPrice siempre está en baseCurrency (aliExpressPrice convertido)
    
    // ✅ Convertir costPrice a saleCurrency si es necesario
    let costPriceInSaleCurrency = data.costPrice;
    if (saleCurrency.toUpperCase() !== costCurrency.toUpperCase()) {
      try {
        try {
          costPriceInSaleCurrency = fxService.convert(data.costPrice, costCurrency, saleCurrency);
        } catch (error: any) {
          logger.warn('[SaleService] FX conversion failed, using cost price without conversion', {
            from: costCurrency,
            to: saleCurrency,
            amount: data.costPrice,
            error: error?.message
          });
          // Fallback: usar precio de costo sin convertir
          costPriceInSaleCurrency = data.costPrice;
        }
        logger.debug('[SALE] Converted cost price to sale currency', {
          userId,
          productId: data.productId,
          from: costCurrency,
          to: saleCurrency,
          originalCost: data.costPrice,
          convertedCost: costPriceInSaleCurrency
        });
      } catch (conversionError) {
        logger.error('[SALE] Failed to convert cost price, using original value', {
          userId,
          productId: data.productId,
          error: conversionError instanceof Error ? conversionError.message : String(conversionError)
        });
        // Si falla la conversión, usar valor original (puede causar cálculo incorrecto)
        // Esto es mejor que fallar completamente
      }
    }

    // Convertir shippingCost e importTax a saleCurrency (vienen en baseCurrency)
    let shippingInSaleCurrency = 0;
    let importTaxInSaleCurrency = 0;
    if ((data.shippingCost ?? 0) > 0 || (data.importTax ?? 0) > 0) {
      if (saleCurrency.toUpperCase() !== costCurrency.toUpperCase()) {
        try {
          if ((data.shippingCost ?? 0) > 0) shippingInSaleCurrency = fxService.convert(data.shippingCost!, costCurrency, saleCurrency);
          if ((data.importTax ?? 0) > 0) importTaxInSaleCurrency = fxService.convert(data.importTax!, costCurrency, saleCurrency);
        } catch (e) {
          shippingInSaleCurrency = data.shippingCost ?? 0;
          importTaxInSaleCurrency = data.importTax ?? 0;
        }
      } else {
        shippingInSaleCurrency = data.shippingCost ?? 0;
        importTaxInSaleCurrency = data.importTax ?? 0;
      }
    }

    const effectiveCost = costPriceInSaleCurrency + shippingInSaleCurrency + importTaxInSaleCurrency;

    // Validar que salePrice sea mayor que costo efectivo total (producto + envío + impuestos)
    if (data.salePrice <= effectiveCost) {
      throw new AppError(`Sale price (${data.salePrice} ${saleCurrency}) must be greater than total cost (${effectiveCost.toFixed(2)} ${saleCurrency}: product + shipping + import tax) to generate profit`, 400);
    }

    // Calcular ganancias y comisiones (ambos en saleCurrency)
    const platformFees = data.platformFees || 0;
    const grossProfit = data.salePrice - effectiveCost - platformFees;

    // Platform commission from config (default 10% of gross profit)
    const commissionPct = await platformConfigService.getCommissionPct();
    const { roundMoney } = require('../utils/money.utils');
    const grossProfitNum = toNumber(grossProfit);
    const platformCommission = roundMoney((grossProfitNum * commissionPct) / 100, saleCurrency);
    const netProfit = roundMoney(grossProfitNum - platformCommission, saleCurrency);

    // Validación matemática: netProfit = salePrice - effectiveCost - platformFees - platformCommission
    const expectedNetProfit = data.salePrice - effectiveCost - platformFees - platformCommission;
    const diff = Math.abs(toNumber(netProfit) - expectedNetProfit);
    if (diff > 0.05) {
      logger.error('[SALE] CRITICAL: netProfit validation failed', {
        netProfit: toNumber(netProfit),
        expectedNetProfit,
        salePrice: data.salePrice,
        effectiveCost,
        platformFees,
        platformCommission,
        diff,
      });
      throw new AppError(`netProfit validation failed: expected ${expectedNetProfit}, got ${netProfit}`, 500);
    }

    // ✅ User and creator admin for legacy AdminCommission (if user was created by admin)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        commissionRate: true,
        createdBy: true,
        paypalPayoutEmail: true,
      } as any,
    });

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    const adminId: number | null = user && typeof (user as any).createdBy === 'number' ? (user as any).createdBy : null;
    const adminCommission = platformCommission; // Platform commission (goes to admin PayPal)

    // Resolver environment: explícito en DTO o del workflow del usuario
    let environment: 'sandbox' | 'production' = data.environment ?? 'sandbox';
    if (!data.environment) {
      try {
        const { workflowConfigService } = await import('./workflow-config.service');
        environment = await workflowConfigService.getUserEnvironment(userId);
      } catch {
        logger.warn('[SALE] Could not get user environment, using sandbox', { userId });
      }
    }

    // ✅ Usar transacción para crear venta, comisiones y actualizar balances de forma atómica
    const sale = await prisma.$transaction(async (tx) => {
      // ✅ RESILIENCIA: Intentar crear venta con currency, si falla (migración no ejecutada), intentar sin currency
      let newSale;
      try {
        newSale = await tx.sale.create({
          data: {
            orderId: data.orderId,
            productId: data.productId,
            userId: userId,
            marketplace: data.marketplace,
            salePrice: data.salePrice,
            aliexpressCost: data.costPrice,
            marketplaceFee: platformFees,
            grossProfit,
            commissionAmount: adminCommission, // Comisión del admin (20% por defecto)
            netProfit,
            currency: saleCurrency, // ✅ Guardar moneda de la venta
            status: 'PENDING',
            environment,
          },
          include: {
            product: true,
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        });
      } catch (error: any) {
        // ✅ Si falla por campo currency (migración no ejecutada), intentar sin currency
        if (error?.code === 'P2009' || error?.message?.includes('currency') || error?.message?.includes('Unknown column')) {
          logger.warn('[SALE-SERVICE] Currency field not found in database, creating sale without currency field (migration may not be executed)', {
            error: error?.message?.substring(0, 200),
            userId
          });
          // Intentar sin el campo currency
          newSale = await tx.sale.create({
            data: {
              orderId: data.orderId,
              productId: data.productId,
              userId: userId,
              marketplace: data.marketplace,
              salePrice: data.salePrice,
              aliexpressCost: data.costPrice,
              marketplaceFee: platformFees,
              grossProfit,
              commissionAmount: adminCommission,
              netProfit,
              // currency: omitido temporalmente hasta que se ejecute la migración
              status: 'PENDING',
              environment,
            },
            include: {
              product: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
            },
          });
        } else {
          // Re-lanzar el error si no es por currency
          throw error;
        }
      }

      // ✅ RESILIENCIA: Intentar crear comisión con currency, si falla, intentar sin currency
      try {
        await tx.commission.create({
          data: {
            saleId: newSale.id,
            userId, // Usuario que generó la venta
            amount: adminCommission, // Comisión del admin (20% de gross profit)
            currency: saleCurrency, // ✅ Guardar moneda de la comisión (debe coincidir con Sale.currency)
            status: 'PENDING',
            environment,
          },
        });
      } catch (error: any) {
        // ✅ Si falla por campo currency (migración no ejecutada), intentar sin currency
        if (error?.code === 'P2009' || error?.message?.includes('currency') || error?.message?.includes('Unknown column')) {
          logger.warn('[SALE-SERVICE] Currency field not found in Commission table, creating without currency field', {
            error: error?.message?.substring(0, 200),
            saleId: newSale.id
          });
          await tx.commission.create({
            data: {
              saleId: newSale.id,
              userId,
              amount: adminCommission,
              // currency: omitido temporalmente hasta que se ejecute la migración
              status: 'PENDING',
              environment,
            },
          });
        } else {
          // Re-lanzar el error si no es por currency
          throw error;
        }
      }

      // ✅ Crear comisión adicional del admin si el usuario fue creado por otro admin
      if (adminId && user.createdBy && adminId !== userId) {
        try {
          await tx.adminCommission.create({
            data: {
              adminId,
              userId: userId,
              saleId: newSale.id,
              amount: adminCommission,
              currency: saleCurrency, // ✅ Guardar moneda de la comisión del admin
              commissionType: 'user_sale',
              status: 'PENDING',
              environment,
            }
          });
        } catch (error: any) {
          // ✅ Si falla por campo currency (migración no ejecutada), intentar sin currency
          if (error?.code === 'P2009' || error?.message?.includes('currency') || error?.message?.includes('Unknown column')) {
            logger.warn('[SALE-SERVICE] Currency field not found in AdminCommission table, creating without currency field', {
              error: error?.message?.substring(0, 200),
              saleId: newSale.id
            });
            await tx.adminCommission.create({
              data: {
                adminId,
                userId: userId,
                saleId: newSale.id,
                amount: adminCommission,
                // currency: omitido temporalmente hasta que se ejecute la migración
                commissionType: 'user_sale',
                status: 'PENDING',
                environment,
              }
            });
          } else {
            // Re-lanzar el error si no es por currency
            throw error;
          }
        }

        // Admin balance updated after successful PayPal payout (see below)
      }

      // User balance/totals updated after successful PayPal payouts (see below)

      // Registrar actividad dentro de la transacción
      await tx.activity.create({
        data: {
          userId: userId,
          action: 'SALE_CREATED',
          description: `Venta registrada: ${newSale.orderId} - $${newSale.salePrice}`,
          metadata: JSON.stringify({ saleId: newSale.id, orderId: newSale.orderId }),
        },
      });

      return newSale;
    });

    // ✅ Dual PayPal payout: admin (commission) then user (userProfit). Both must succeed. Usar environment de la venta.
    const payoutService = await (await import('./paypal-payout.service')).PayPalPayoutService.fromUserCredentials(userId, environment);
    const adminPaypalEmail = await platformConfigService.getAdminPaypalEmail();
    const userPaypalEmail = (user as any).paypalPayoutEmail?.trim() || null;

    // ✅ Phase F: When AUTOPILOT_MODE=production, skipping payouts is forbidden
    const autopilotMode = (process.env.AUTOPILOT_MODE || 'sandbox') as 'production' | 'sandbox';
    if (!payoutService || !userPaypalEmail || !adminPaypalEmail) {
      if (autopilotMode === 'production') {
        const reason = 'missing_config: PAYPAL credentials or adminPaypalEmail or user paypalPayoutEmail';
        logger.error('[SALE] PAYOUT_FAILED: missing config (production mode)', {
          saleId: sale.id,
          orderId: sale.orderId,
          reason,
          hasPayoutService: !!payoutService,
          hasUserPaypal: !!userPaypalEmail,
          hasAdminPaypal: !!adminPaypalEmail,
        });
        await prisma.sale.update({
          where: { id: sale.id },
          data: { status: 'PAYOUT_FAILED' },
        });
        throw new AppError(
          'AUTOPILOT_MODE=production: PayPal config required. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, adminPaypalEmail in PlatformConfig, and user paypalPayoutEmail.',
          502
        );
      }
      await prisma.sale.update({
        where: { id: sale.id },
        data: { status: 'PAYOUT_FAILED' },
      });
      logger.warn('[SALE] PAYOUT_FAILED: missing PayPal config or user paypalPayoutEmail (sandbox)', {
        saleId: sale.id,
        orderId: sale.orderId,
        reason: 'missing_config',
        hasPayoutService: !!payoutService,
        hasUserPaypal: !!userPaypalEmail,
        hasAdminPaypal: !!adminPaypalEmail,
      });
      return sale;
    }

    // ✅ Idempotencia: evitar doble payout
    const saleFresh = await prisma.sale.findUnique({
      where: { id: sale.id },
      select: { payoutExecuted: true, adminPayoutId: true, userPayoutId: true },
    });
    const alreadyPaid = (saleFresh as any)?.payoutExecuted === true || (!!saleFresh?.adminPayoutId && !!saleFresh?.userPayoutId);
    if (alreadyPaid) {
      logger.info('[SALE] Payout already executed, skipping (idempotent)', { saleId: sale.id });
      return sale;
    }

    const commissionAmountNum = toNumber(sale.commissionAmount);
    const netProfitNum = toNumber(sale.netProfit);
    if (commissionAmountNum <= 0 && netProfitNum <= 0) {
      return sale;
    }

    // Verificación obligatoria de saldo real antes de payout (no workingCapital)
    const totalPayoutAmount = commissionAmountNum + netProfitNum;
    const { hasSufficientBalanceForPayout } = await import('./balance-verification.service');
    const payoutBalanceCheck = await hasSufficientBalanceForPayout(totalPayoutAmount);
    if (!payoutBalanceCheck.sufficient) {
      const reason = `insufficient_balance: required=${payoutBalanceCheck.required}, available=${payoutBalanceCheck.available}`;
      logger.warn('[SALE] PAYOUT_SKIPPED_INSUFFICIENT_FUNDS', {
        saleId: sale.id,
        orderId: sale.orderId,
        reason,
        required: payoutBalanceCheck.required,
        available: payoutBalanceCheck.available,
        source: payoutBalanceCheck.source,
        error: payoutBalanceCheck.error,
      });
      await prisma.sale.update({
        where: { id: sale.id },
        data: { status: 'PAYOUT_SKIPPED_INSUFFICIENT_FUNDS' as any },
      });
      return sale;
    }
    logger.info('[SALE] Real balance verified for payout', {
      saleId: sale.id,
      required: payoutBalanceCheck.required,
      available: payoutBalanceCheck.available,
      source: payoutBalanceCheck.source,
    });

    let adminPayoutId: string | null = null;
    let userPayoutId: string | null = null;

    if (commissionAmountNum > 0) {
      const adminRes = await payoutService.sendPayout({
        recipientEmail: adminPaypalEmail,
        amount: commissionAmountNum,
        currency: sale.currency,
        note: `Platform commission - Sale ${sale.orderId}`,
        senderItemId: `sale-${sale.id}-admin`,
      });
      if (!adminRes.success) {
        const reason = `admin_payout_failed: ${adminRes.error}`;
        logger.error('[SALE] PAYOUT_FAILED: admin payout failed', {
          saleId: sale.id,
          orderId: sale.orderId,
          reason,
          error: adminRes.error,
        });
        await prisma.sale.update({
          where: { id: sale.id },
          data: { status: 'PAYOUT_FAILED' },
        });
        throw new AppError(`Admin payout failed: ${adminRes.error}`, 502);
      }
      adminPayoutId = adminRes.batchId || null;
    }

    if (netProfitNum > 0) {
      let userPayoutOk = false;
      const userPayoneerEmail = (user as any).payoneerPayoutEmail?.trim() || null;
      const payoneerService = (await import('./payoneer.service')).PayoneerService.fromEnv();
      const preferPayoneer = process.env.PAYOUT_PROVIDER === 'payoneer';
      if (payoneerService && userPayoneerEmail && preferPayoneer) {
        const payoneerRes = await payoneerService.withdrawFunds({
          recipientEmail: userPayoneerEmail,
          amount: netProfitNum,
          currency: sale.currency,
          note: `Your profit - Sale ${sale.orderId}`,
          senderItemId: `sale-${sale.id}-user`,
        });
        if (payoneerRes.success) {
          userPayoutId = payoneerRes.batchId || payoneerRes.transactionId || 'payoneer';
          userPayoutOk = true;
          logger.info('[SALE] User payout via Payoneer', { saleId: sale.id });
        }
      }
      if (!userPayoutOk) {
        const userRes = await payoutService.sendPayout({
          recipientEmail: userPaypalEmail,
          amount: netProfitNum,
          currency: sale.currency,
          note: `Your profit - Sale ${sale.orderId}`,
          senderItemId: `sale-${sale.id}-user`,
        });
        if (!userRes.success) {
          const reason = `user_payout_failed: ${userRes.error}`;
          logger.error('[SALE] PAYOUT_FAILED: user payout failed', {
            saleId: sale.id,
            orderId: sale.orderId,
            reason,
            error: userRes.error,
            adminPayoutId,
          });
          await prisma.sale.update({
            where: { id: sale.id },
            data: { status: 'PAYOUT_FAILED', adminPayoutId } as any,
          });
          throw new AppError(`User payout failed: ${userRes.error}`, 502);
        }
        userPayoutId = userRes.batchId || null;
      }
    }

    await prisma.sale.update({
      where: { id: sale.id },
      data: { adminPayoutId, userPayoutId, payoutExecuted: true } as any,
    });

    logger.info('[PAYOUT_EXECUTED]', {
      saleId: sale.id,
      orderId: sale.orderId,
      adminPayoutId: adminPayoutId ?? null,
      userPayoutId: userPayoutId ?? null,
      timestamp: new Date().toISOString(),
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        balance: { increment: netProfitNum },
        totalEarnings: { increment: netProfitNum },
        totalSales: { increment: 1 },
      },
    });
    if (adminId && commissionAmountNum > 0) {
      await prisma.user.update({
        where: { id: adminId },
        data: {
          balance: { increment: commissionAmountNum },
          totalEarnings: { increment: commissionAmountNum },
        },
      });
    }

    // ✅ NOTIFICAR AL USUARIO DE LA VENTA
    try {
      await notificationService.sendToUser(sale.userId, {
        type: 'SALE_CREATED' as const,
        title: 'Nueva Venta Registrada',
        message: `Venta ${sale.orderId} por $${toNumber(sale.salePrice).toFixed(2)} - ${sale.product.title}`,
        priority: 'HIGH',
            // ✅ FIX: No category field allowed in sendAlert (removed duplicate)
        data: {
          saleId: sale.id,
          orderId: sale.orderId,
          amount: toNumber(sale.salePrice)
        }
      } as any);
    } catch (error) {
      logger.error('Error sending sale notification', { error, saleId: sale.id });
    }

    // ✅ VERIFICAR MODO DE COMPRA (AUTO, MANUAL o GUIDED) y EJECUTAR FLUJO
    try {
      const { workflowConfigService } = await import('./workflow-config.service');
      const purchaseMode = await workflowConfigService.getStageMode(userId, 'purchase').catch(() => 'manual');

      if (purchaseMode === 'automatic') {
        // ✅ COMPRA AUTOMÁTICA - Ejecutar flujo automatizado
        const { AutomationService } = await import('./automation.service');
        const { workflowConfigService } = await import('./workflow-config.service');
        const userEnvironment = await workflowConfigService.getUserEnvironment(userId);
        const automationService = new AutomationService({
          mode: 'automatic',
          environment: userEnvironment || 'sandbox',
          maxConcurrentJobs: 5,
          retryAttempts: 3,
          delayBetweenOperations: 1000,
          enableRealTimeNotifications: true
        });
        
        // Crear objeto AutomatedOrder compatible
        const automatedOrder: AutomatedOrder = {
          id: sale.orderId,
          opportunityId: sale.product.id.toString(),
          customerId: sale.userId.toString(),
          customerInfo: {
            name: data.buyerEmail || 'Cliente',
            email: data.buyerEmail || '',
            address: data.shippingAddress ? {
              street: typeof data.shippingAddress === 'string' ? data.shippingAddress : (data.shippingAddress as any).street || '',
              city: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).city || '',
              state: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).state || '',
              zipCode: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).zipCode || '',
              country: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).country || ''
            } : {
              street: '',
              city: '',
              state: '',
              zipCode: '',
              country: ''
            }
          },
          orderDetails: {
            quantity: 1,
            unitPrice: toNumber(sale.salePrice),
            totalAmount: toNumber(sale.salePrice),
            paymentMethod: 'pending'
          } as any, // ✅ Compatibilidad con AutomatedOrder
          status: 'pending',
          timestamps: {
            created: new Date()
          }
        };
        
        await automationService.executeAutomatedFlow(automatedOrder);

        logger.info('Automatic purchase flow executed', { saleId: sale.id, orderId: sale.orderId });
      } else if (purchaseMode === 'guided') {
        // ✅ MODO GUIDED - Notificar y esperar confirmación rápida antes de ejecutar
        const { guidedActionTracker } = await import('./guided-action-tracker.service');
        const { AutomationService } = await import('./automation.service');
        const { workflowConfigService } = await import('./workflow-config.service');
        
        const userEnvironment = await workflowConfigService.getUserEnvironment(userId);
        
        // Registrar acción guided con callback
        const actionId = await guidedActionTracker.registerAction(
          userId,
          'purchase',
          'confirm',
          {
            saleId: sale.id,
            orderId: sale.orderId,
            productTitle: sale.product.title,
            amount: toNumber(sale.salePrice),
            cost: toNumber(sale.aliexpressCost || 0)
          },
          5, // 5 minutos timeout
          async () => {
            // Callback que se ejecuta si hay timeout o confirmación
            const automationService = new AutomationService({
              mode: 'automatic',
              environment: userEnvironment || 'sandbox',
              maxConcurrentJobs: 5,
              retryAttempts: 3,
              delayBetweenOperations: 1000,
              enableRealTimeNotifications: true
            });
            
            const automatedOrder: AutomatedOrder = {
              id: sale.orderId,
              opportunityId: sale.product.id.toString(),
              customerId: sale.userId.toString(),
              customerInfo: {
                name: data.buyerEmail || 'Cliente',
                email: data.buyerEmail || '',
                address: data.shippingAddress ? {
                  street: typeof data.shippingAddress === 'string' ? data.shippingAddress : (data.shippingAddress as any).street || '',
                  city: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).city || '',
                  state: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).state || '',
                  zipCode: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).zipCode || '',
                  country: typeof data.shippingAddress === 'string' ? '' : (data.shippingAddress as any).country || ''
                } : {
                  street: '',
                  city: '',
                  state: '',
                  zipCode: '',
                  country: ''
                }
              },
              orderDetails: {
                quantity: 1,
                unitPrice: toNumber(sale.salePrice),
                totalAmount: toNumber(sale.salePrice),
                paymentMethod: 'pending'
              } as any,
              status: 'pending',
              timestamps: {
                created: new Date()
              }
            };
            
            await automationService.executeAutomatedFlow(automatedOrder);
          }
        );
        
        await notificationService.sendAlert({
          type: 'action_required', // ✅ FIX: 'USER_ACTION' no existe, usar 'action_required'
          title: 'Compra guiada - Confirmación requerida',
          message: `Venta ${sale.orderId} por $${sale.salePrice.toFixed(2)} lista para compra automática. ¿Deseas proceder ahora? (Se ejecutará automáticamente en 5 minutos si no respondes)`,
          priority: 'HIGH',
            // ✅ FIX: No category field allowed in sendAlert (removed duplicate)
          data: { 
            saleId: sale.id, 
            orderId: sale.orderId,
            stage: 'purchase',
            mode: 'guided',
            actionId,
            userId: userId,
            productTitle: sale.product.title,
            productUrl: sale.product.aliexpressUrl || sale.product.sourceUrl || '',
            amount: toNumber(sale.salePrice),
            cost: toNumber(sale.aliexpressCost || 0)
          },
          actions: [
            { 
              id: `${actionId}_confirm`, 
              label: '✅ Confirmar y Comprar Ahora', 
              action: 'confirm_purchase_guided', 
              variant: 'primary' 
            },
            { 
              id: `${actionId}_cancel`, 
              label: '❌ Cancelar Compra', 
              action: 'cancel_purchase_guided', 
              variant: 'danger' 
            }
          ]
          // ✅ FIX: expiresAt no está en el tipo de sendAlert, se maneja internamente
        });

        logger.info('Guided purchase flow initiated - waiting for user confirmation', { 
          saleId: sale.id, 
          orderId: sale.orderId,
          actionId,
          timeoutMinutes: 5
        });
      } else {
        // ✅ MODO MANUAL - Notificar y esperar acción manual del usuario
        await notificationService.sendAlert({
          type: 'action_required',
          title: 'Venta requiere compra manual',
          message: `Venta ${sale.orderId} por $${sale.salePrice.toFixed(2)} requiere procesamiento manual. ¿Desea proceder con la compra?`,
          priority: 'HIGH',
            // ✅ FIX: No category field allowed in sendAlert (removed duplicate)
          data: { 
            saleId: sale.id, 
            orderId: sale.orderId,
            stage: 'purchase',
            mode: 'manual',
            userId: userId,
            productTitle: sale.product.title,
            productUrl: sale.product.aliexpressUrl || sale.product.sourceUrl || '',
            amount: toNumber(sale.salePrice),
            cost: toNumber(sale.aliexpressCost || 0)
          },
          actions: [
            { 
              id: `manual_purchase_${sale.id}_confirm`, 
              label: 'Confirmar Compra', 
              action: 'confirm_purchase_manual', 
              variant: 'primary' 
            }
          ]
        });

        logger.info('Purchase requires manual confirmation', { saleId: sale.id, orderId: sale.orderId });
      }
    } catch (error) {
      logger.error('Error processing purchase flow', { error, saleId: sale.id });
    }

    return sale;
  }

  async getSales(userId?: string | number, status?: string, environment: 'production' | 'sandbox' | 'all' = 'production') {
    const where: any = {};
    
    if (userId) {
      // Convertir userId a number si es string (Prisma espera number)
      where.userId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    }
    
    if (status) {
      where.status = status;
    }

    if (environment !== 'all') {
      where.environment = environment;
    }

    return prisma.sale.findMany({
      where,
      include: {
        product: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        commission: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get sale by ID with optional ownership validation
   * @param id - Sale ID
   * @param userId - Optional user ID to validate ownership (if provided, non-admin users can only see their own sales)
   * @param isAdmin - Whether the requesting user is an admin (admins can see all sales)
   */
  async getSaleById(id: number, userId?: number, isAdmin: boolean = false) {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        commission: true,
      },
    });

    if (!sale) {
      throw new AppError('Venta no encontrada', 404);
    }

    // ✅ C2: Validar ownership - usuarios no-admin solo pueden ver sus propias ventas
    if (userId && !isAdmin && sale.userId !== userId) {
      throw new AppError('No tienes permiso para ver esta venta', 403);
    }

    return sale;
  }

  async updateSaleStatus(id: number, status: string, userId?: number, isAdmin: boolean = false) {
    // ✅ C2: Pasar userId e isAdmin para validar ownership
    const sale = await this.getSaleById(id, userId, isAdmin);

    const updateData: any = { status };

    // ✅ Si se marca como DELIVERED, verificar si puede marcarse como ciclo completo
    if (status === 'DELIVERED' && !sale.isCompleteCycle) {
      const { successfulOperationService } = await import('./successful-operation.service');
      
      if (await successfulOperationService.canMarkAsSuccessful(id)) {
        // Marcar como ciclo completo (sin devoluciones ni problemas por defecto)
        updateData.isCompleteCycle = true;
        updateData.completedAt = new Date();

        // ✅ Crear registro de operación exitosa
        try {
          const operation = await successfulOperationService.markAsSuccessful({
            userId: sale.userId,
            productId: sale.productId,
            saleId: id,
            startDate: sale.createdAt,
            completionDate: new Date(),
            totalProfit: toNumber(sale.netProfit),
            expectedProfit: toNumber(sale.grossProfit),
            hadReturns: false,
            hadIssues: false
          });

          // ✅ Aprender de la operación exitosa
          try {
            const { aiLearningSystem } = await import('./ai-learning.service');
            if (aiLearningSystem) {
              await aiLearningSystem.learnFromSale({
                sku: sale.productId.toString(),
                price: toNumber(sale.salePrice),
                profit: toNumber(sale.netProfit),
                aiScore: 0.8, // TODO: Obtener score real de la predicción original
                sold: true,
                category: sale.product.category || undefined,
                marketplace: sale.marketplace,
                daysToSell: Math.ceil(
                  (new Date().getTime() - sale.createdAt.getTime()) / (1000 * 60 * 60 * 24)
                ),
                isCompleteCycle: true,
                hadReturns: false,
                hadIssues: false
              });
            }
          } catch (learningError) {
            logger.error('Error learning from successful operation', { error: learningError, saleId: id });
          }
        } catch (error) {
          logger.error('Error marking sale as successful operation', { error, saleId: id });
        }
      }
    }

    const updated = await prisma.sale.update({
      where: { id },
      data: updateData,
      include: {
        product: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        commission: true,
      },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId: sale.userId,
        action: 'SALE_STATUS_CHANGED',
        description: `Estado de venta ${sale.orderId} cambiado a ${status}`,
        metadata: JSON.stringify({ saleId: id, newStatus: status }),
      },
    });

    // Si la venta se completa, actualizar estado de comisión
    if (status === 'COMPLETED' && sale.commission) {
      await prisma.commission.update({
        where: { id: sale.commission.id },
        data: { status: 'SCHEDULED' },
      });
    }

    // Si la venta se cancela, revertir comisión
    if (status === 'CANCELLED' && sale.commission) {
      await prisma.commission.update({
        where: { id: sale.commission.id },
        data: { status: 'CANCELLED' },
      });

      // Revertir balance del usuario
      await prisma.user.update({
        where: { id: sale.userId },
        data: {
          balance: {
            decrement: sale.commissionAmount,
          },
          totalEarnings: {
            decrement: sale.commissionAmount,
          },
        },
      });
    }

    return updated;
  }

  async getSalesStats(userId?: string | number, days?: number, environment: 'production' | 'sandbox' | 'all' = 'production') {
    const { queryWithTimeout } = await import('../utils/queryWithTimeout');
    // Convertir userId a number si es string (Prisma espera number)
    const userIdNumber = userId ? (typeof userId === 'string' ? parseInt(userId, 10) : userId) : undefined;
    const baseWhere = userIdNumber ? { userId: userIdNumber } : {};
    const dateFilter = typeof days === 'number' && days > 0
      ? { createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } }
      : {};
    const envFilter = environment !== 'all' ? { environment } : {};
    const where = { ...baseWhere, ...dateFilter, ...envFilter };

    const queriesPromise = Promise.all([
      prisma.sale.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.sale.count({ where: { ...where, status: 'PENDING' } }),
      prisma.sale.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.sale.count({ where: { ...where, status: 'CANCELLED' } }),
      prisma.sale.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: { salePrice: true },
      }),
      prisma.sale.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: { commissionAmount: true },
      }),
    ]);

    // ✅ FIX: Agregar timeout de 20 segundos a las queries
    const [
      totalSales,
      pendingSales,
      completedSales,
      cancelledSales,
      totalRevenue,
      totalCommissions,
    ] = await queryWithTimeout(queriesPromise, 20000);

    const netProfitAgg = await prisma.sale.aggregate({
      where: { ...where, status: 'COMPLETED' },
      _sum: { netProfit: true },
    });
    const totalProfit = netProfitAgg._sum.netProfit ?? 0;

    return {
      totalSales,
      pendingSales,
      completedSales,
      cancelledSales,
      totalRevenue: totalRevenue._sum.salePrice || 0,
      totalCommissions: totalCommissions._sum.commissionAmount || 0,
      totalProfit: typeof totalProfit === 'object' ? Number((totalProfit as any) ?? 0) : Number(totalProfit),
      platformCommissionPaid: totalCommissions._sum.commissionAmount || 0,
    };
  }

  /**
   * Admin: total platform revenue (commissions collected) and per-user revenue table.
   */
  async getPlatformRevenueStats() {
    const [totalCommission, perUser] = await Promise.all([
      prisma.sale.aggregate({
        where: { status: { not: 'PAYOUT_FAILED' } },
        _sum: { commissionAmount: true },
        _count: { id: true },
      }),
      prisma.sale.groupBy({
        by: ['userId'],
        where: { status: { not: 'PAYOUT_FAILED' } },
        _sum: { commissionAmount: true, netProfit: true, grossProfit: true },
        _count: { id: true },
      }),
    ]);
    const users = await prisma.user.findMany({
      where: { id: { in: perUser.map((p) => p.userId) } },
      select: { id: true, username: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const perUserTable = perUser.map((p) => ({
      userId: p.userId,
      username: userMap.get(p.userId)?.username ?? '',
      email: userMap.get(p.userId)?.email ?? '',
      salesCount: p._count.id,
      grossProfit: Number(p._sum.grossProfit ?? 0),
      platformCommission: Number(p._sum.commissionAmount ?? 0),
      userProfit: Number(p._sum.netProfit ?? 0),
    }));

    return {
      totalPlatformRevenue: Number(totalCommission._sum.commissionAmount ?? 0),
      totalCommissionsCollected: Number(totalCommission._sum.commissionAmount ?? 0),
      salesCount: totalCommission._count.id,
      perUser: perUserTable,
    };
  }

  /**
   * Admin: Retry payout for a sale in PAYOUT_FAILED or PAYOUT_SKIPPED_INSUFFICIENT_FUNDS.
   * Re-runs the dual payout (admin + user) if config and balance are now available.
   */
  async retryPayout(saleId: number): Promise<{ success: boolean; message?: string }> {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            paypalPayoutEmail: true,
            payoneerPayoutEmail: true,
            createdBy: true,
          },
        },
      },
    });
    if (!sale) {
      return { success: false, message: 'Venta no encontrada' };
    }
    const allowedStatuses = ['PAYOUT_FAILED', 'PAYOUT_SKIPPED_INSUFFICIENT_FUNDS'];
    if (!allowedStatuses.includes(sale.status)) {
      return {
        success: false,
        message: `Venta no está en estado retryable (actual: ${sale.status}). Solo PAYOUT_FAILED o PAYOUT_SKIPPED_INSUFFICIENT_FUNDS.`,
      };
    }
    const userId = sale.userId;
    const user = sale.user as any;
    const adminId: number | null = user?.createdBy ?? null;
    const environment = (sale.environment || 'sandbox') as 'sandbox' | 'production';

    const payoutService = await (await import('./paypal-payout.service')).PayPalPayoutService.fromUserCredentials(userId, environment);
    const adminPaypalEmail = await platformConfigService.getAdminPaypalEmail();
    const userPaypalEmail = user?.paypalPayoutEmail?.trim() || null;

    if (!payoutService || !userPaypalEmail || !adminPaypalEmail) {
      logger.warn('[SALE] retryPayout: config still missing', { saleId, hasPayoutService: !!payoutService, hasUserPaypal: !!userPaypalEmail, hasAdminPaypal: !!adminPaypalEmail });
      return {
        success: false,
        message: 'Configuración PayPal incompleta. Verifique PAYPAL_*, adminPaypalEmail en PlatformConfig y paypalPayoutEmail del usuario.',
      };
    }

    const saleFresh = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { payoutExecuted: true, adminPayoutId: true, userPayoutId: true },
    });
    const alreadyPaid = (saleFresh as any)?.payoutExecuted === true || (!!saleFresh?.adminPayoutId && !!saleFresh?.userPayoutId);
    if (alreadyPaid) {
      return { success: false, message: 'El payout ya fue ejecutado (idempotente)' };
    }

    const commissionAmountNum = toNumber(sale.commissionAmount);
    const netProfitNum = toNumber(sale.netProfit);
    if (commissionAmountNum <= 0 && netProfitNum <= 0) {
      return { success: false, message: 'Sin monto a pagar (comisión y ganancia neta <= 0)' };
    }

    const totalPayoutAmount = commissionAmountNum + netProfitNum;
    const { hasSufficientBalanceForPayout } = await import('./balance-verification.service');
    const payoutBalanceCheck = await hasSufficientBalanceForPayout(totalPayoutAmount);
    if (!payoutBalanceCheck.sufficient) {
      logger.warn('[SALE] retryPayout: insufficient balance', {
        saleId,
        required: payoutBalanceCheck.required,
        available: payoutBalanceCheck.available,
      });
      return {
        success: false,
        message: `Saldo insuficiente. Requerido: ${payoutBalanceCheck.required}, disponible: ${payoutBalanceCheck.available}`,
      };
    }

    let adminPayoutId: string | null = null;
    let userPayoutId: string | null = null;

    try {
      if (commissionAmountNum > 0) {
        const adminRes = await payoutService.sendPayout({
          recipientEmail: adminPaypalEmail,
          amount: commissionAmountNum,
          currency: sale.currency,
          note: `Platform commission (retry) - Sale ${sale.orderId}`,
          senderItemId: `sale-${sale.id}-admin-retry`,
        });
        if (!adminRes.success) {
          logger.error('[SALE] retryPayout: admin payout failed', { saleId, error: adminRes.error });
          await prisma.sale.update({ where: { id: saleId }, data: { status: 'PAYOUT_FAILED' } });
          return { success: false, message: `Admin payout failed: ${adminRes.error}` };
        }
        adminPayoutId = adminRes.batchId || null;
      }

      if (netProfitNum > 0) {
        let userPayoutOk = false;
        const userPayoneerEmail = user?.payoneerPayoutEmail?.trim() || null;
        const payoneerService = (await import('./payoneer.service')).PayoneerService.fromEnv();
        const preferPayoneer = process.env.PAYOUT_PROVIDER === 'payoneer';
        if (payoneerService && userPayoneerEmail && preferPayoneer) {
          const payoneerRes = await payoneerService.withdrawFunds({
            recipientEmail: userPayoneerEmail,
            amount: netProfitNum,
            currency: sale.currency,
            note: `Your profit (retry) - Sale ${sale.orderId}`,
            senderItemId: `sale-${sale.id}-user-retry`,
          });
          if (payoneerRes.success) {
            userPayoutId = payoneerRes.batchId || payoneerRes.transactionId || 'payoneer';
            userPayoutOk = true;
          }
        }
        if (!userPayoutOk) {
          const userRes = await payoutService.sendPayout({
            recipientEmail: userPaypalEmail,
            amount: netProfitNum,
            currency: sale.currency,
            note: `Your profit (retry) - Sale ${sale.orderId}`,
            senderItemId: `sale-${sale.id}-user-retry`,
          });
          if (!userRes.success) {
            logger.error('[SALE] retryPayout: user payout failed', { saleId, error: userRes.error });
            await prisma.sale.update({
              where: { id: saleId },
              data: { status: 'PAYOUT_FAILED', adminPayoutId } as any,
            });
            return { success: false, message: `User payout failed: ${userRes.error}` };
          }
          userPayoutId = userRes.batchId || null;
        }
      }

      await prisma.sale.update({
        where: { id: saleId },
        data: { adminPayoutId, userPayoutId, payoutExecuted: true } as any,
      });

      await prisma.user.update({
        where: { id: userId },
        data: {
          balance: { increment: netProfitNum },
          totalEarnings: { increment: netProfitNum },
          totalSales: { increment: 1 },
        },
      });
      if (adminId && commissionAmountNum > 0) {
        await prisma.user.update({
          where: { id: adminId },
          data: { balance: { increment: commissionAmountNum }, totalEarnings: { increment: commissionAmountNum } },
        });
      }

      logger.info('[SALE] retryPayout success', { saleId, adminPayoutId, userPayoutId });
      return { success: true };
    } catch (err: any) {
      logger.error('[SALE] retryPayout exception', { saleId, error: err?.message });
      await prisma.sale.update({ where: { id: saleId }, data: { status: 'PAYOUT_FAILED' } });
      return { success: false, message: err?.message || 'Error desconocido en retry payout' };
    }
  }

  /**
   * Derives marketplace from Order. Webhooks use paypalOrderId = "marketplace:orderId";
   * checkout uses PayPal order ID. Fallback: infer from Product's MarketplaceListing.
   */
  private async deriveMarketplaceFromOrder(
    order: { paypalOrderId?: string | null },
    productId: number,
    userId: number
  ): Promise<string> {
    const validMarketplaces = ['ebay', 'amazon', 'mercadolibre'] as const;
    const pid = order.paypalOrderId?.trim();
    if (pid) {
      const prefix = pid.split(':')[0]?.toLowerCase();
      if (prefix && validMarketplaces.includes(prefix as any)) {
        return prefix;
      }
    }
    const listing = await prisma.marketplaceListing.findFirst({
      where: { productId, userId },
      select: { marketplace: true },
    });
    if (listing?.marketplace && validMarketplaces.includes(listing.marketplace as any)) {
      return listing.marketplace.toLowerCase();
    }
    return 'checkout';
  }

  /**
   * Crea una Sale a partir de un Order en estado PURCHASED (tras fulfillment).
   * Requiere Order.userId y un Product (por order.productId o por productUrl del usuario).
   */
  async createSaleFromOrder(orderId: string): Promise<{ id: number } | null> {
    const ts = new Date().toISOString();
    // Idempotency: avoid duplicate Sale and double payout for same Order
    const existingSale = await prisma.sale.findUnique({ where: { orderId }, select: { id: true } });
    if (existingSale) {
      logger.info('[SALE] createSaleFromOrder idempotent: Sale already exists', {
        orderId,
        saleId: existingSale.id,
        timestamp: ts,
      });
      return { id: existingSale.id };
    }
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, productId: true, productUrl: true, price: true, currency: true, customerEmail: true, shippingAddress: true, paypalOrderId: true },
    });
    if (!order || !order.userId) {
      logger.debug('[SALE] createSaleFromOrder skipped: no order or no userId', { orderId, timestamp: ts });
      return null;
    }
    const userId = order.userId;
    let product: { id: number; aliexpressPrice: any; userId: number; shippingCost?: any; importTax?: any; currency?: string } | null = null;
    if (order.productId) {
      product = await prisma.product.findFirst({
        where: { id: order.productId, userId },
        select: { id: true, aliexpressPrice: true, userId: true, shippingCost: true, importTax: true, currency: true },
      }) as any;
    }
    if (!product && order.productUrl) {
      const normalized = order.productUrl.trim();
      product = await prisma.product.findFirst({
        where: { userId, aliexpressUrl: { contains: normalized.length > 50 ? normalized.slice(0, 50) : normalized } },
        select: { id: true, aliexpressPrice: true, userId: true, shippingCost: true, importTax: true, currency: true },
      }) as any;
    }
    if (!product) {
      logger.warn('[SALE] createSaleFromOrder skipped: no product found for order', { orderId, userId, productId: order.productId, productUrl: order.productUrl?.slice(0, 60) });
      return null;
    }
    const costPrice = toNumber(product.aliexpressPrice ?? 0);
    const salePrice = toNumber(order.price);
    if (costPrice <= 0 || salePrice <= 0) {
      logger.warn('[SALE] createSaleFromOrder skipped: invalid prices', { orderId, costPrice, salePrice });
      return null;
    }
    const marketplace = await this.deriveMarketplaceFromOrder(order, product.id, userId);
    const saleCurrency = order.currency || 'USD';
    const baseCurrency = product.currency || 'USD';

    // Region para cost calculator (marketplace -> region default)
    const marketplaceToRegion: Record<string, string> = {
      mercadolibre: 'cl',
      ebay: 'us',
      amazon: 'us',
      checkout: 'us',
    };
    const region = marketplaceToRegion[marketplace] || 'us';

    let shippingCost = toNumber(product.shippingCost ?? 0);
    let importTax = toNumber(product.importTax ?? 0);

    // Convertir shipping/import a saleCurrency para cost calculator
    if ((shippingCost > 0 || importTax > 0) && saleCurrency.toUpperCase() !== baseCurrency.toUpperCase()) {
      try {
        if (shippingCost > 0) shippingCost = fxService.convert(shippingCost, baseCurrency, saleCurrency);
        if (importTax > 0) importTax = fxService.convert(importTax, baseCurrency, saleCurrency);
      } catch (e) {
        // Mantener valores originales si falla la conversión
      }
    }

    // Calcular platformFees (marketplace + payment) con cost calculator
    let platformFees = 0;
    const validMp = ['ebay', 'amazon', 'mercadolibre'].includes(marketplace);
    if (validMp) {
      try {
        const { CostCalculatorService } = await import('./cost-calculator.service');
        const costCalc = new CostCalculatorService();
        const { breakdown } = costCalc.calculateAdvanced(
          marketplace as 'ebay' | 'amazon' | 'mercadolibre',
          region,
          salePrice,
          costPrice,
          saleCurrency,
          baseCurrency,
          { shippingCost: shippingCost > 0 ? shippingCost : undefined, importTax: importTax > 0 ? importTax : undefined }
        );
        platformFees = (breakdown.marketplaceFee ?? 0) + (breakdown.paymentFee ?? 0);
      } catch (e: any) {
        logger.warn('[SALE] createSaleFromOrder: cost calculator failed, platformFees=0', { orderId, error: e?.message });
      }
    }

    // shippingCost/importTax para createSale deben estar en baseCurrency
    const shippingCostBase = toNumber(product.shippingCost ?? 0);
    const importTaxBase = toNumber(product.importTax ?? 0);

    try {
      const sale = await this.createSale(userId, {
        orderId: order.id,
        productId: product.id,
        marketplace,
        salePrice,
        costPrice,
        platformFees,
        shippingCost: shippingCostBase > 0 ? shippingCostBase : undefined,
        importTax: importTaxBase > 0 ? importTaxBase : undefined,
        currency: saleCurrency,
        buyerEmail: order.customerEmail || undefined,
        shippingAddress: order.shippingAddress || undefined,
      }, { fromFulfillment: true });
      logger.info('[SALE] createSaleFromOrder created', {
        orderId,
        saleId: sale.id,
        userId: sale.userId,
        timestamp: new Date().toISOString(),
      });
      return { id: sale.id };
    } catch (err: any) {
      logger.error('[SALE] createSaleFromOrder failed', { orderId, error: err?.message });
      return null;
    }
  }
}

export const saleService = new SaleService();
