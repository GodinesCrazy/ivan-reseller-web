/**
 * ✅ FASE 4: Auto-Purchase Guardrails Service
 * Valida límites, idempotencia y seguridad antes de ejecutar compras automáticas
 */

import { trace } from '../utils/boot-trace';
trace('loading auto-purchase-guardrails.service');

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { toNumber } from '../utils/decimal.utils';

export interface PurchaseValidationResult {
  allowed: boolean;
  reason?: string;
  dryRun?: boolean;
}

export class AutoPurchaseGuardrailsService {
  /**
   * ✅ FASE 4: Validar si la compra automática está habilitada
   */
  static isEnabled(): boolean {
    return env.AUTO_PURCHASE_ENABLED ?? false;
  }

  /**
   * ✅ FASE 4: Validar si está en modo dry-run
   */
  static isDryRun(): boolean {
    return env.AUTO_PURCHASE_DRY_RUN ?? false;
  }

  /**
   * ✅ FASE 4: Validar compra antes de ejecutar
   */
  static async validatePurchase(
    userId: number,
    amount: number,
    orderId: string,
    productId?: number
  ): Promise<PurchaseValidationResult> {
    // 1. Verificar feature flag global
    if (!this.isEnabled()) {
      return {
        allowed: false,
        reason: 'Auto-purchase is disabled (AUTO_PURCHASE_ENABLED=false)',
      };
    }

    // 2. Verificar modo dry-run
    if (this.isDryRun()) {
      logger.info('[AutoPurchaseGuardrails] DRY-RUN mode: Purchase would be executed', {
        userId,
        amount,
        orderId,
        productId,
      });
      return {
        allowed: true,
        dryRun: true,
        reason: 'Dry-run mode enabled - purchase simulated',
      };
    }

    // 3. Verificar límite por orden
    const maxPerOrder = env.AUTO_PURCHASE_MAX_PER_ORDER ?? 500;
    if (amount > maxPerOrder) {
      return {
        allowed: false,
        reason: `Purchase amount $${amount} exceeds maximum per order $${maxPerOrder}`,
      };
    }

    // 4. Verificar idempotencia (evitar doble compra)
    const existingPurchase = await prisma.purchaseLog.findFirst({
      where: {
        userId,
        orderId,
        status: { in: ['SUCCESS', 'PROCESSING'] },
      },
    });

    if (existingPurchase) {
      return {
        allowed: false,
        reason: `Purchase already exists for order ${orderId} (idempotency check)`,
      };
    }

    // 5. Verificar límite diario
    const dailyLimit = env.AUTO_PURCHASE_DAILY_LIMIT ?? 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayPurchases = await prisma.purchaseLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
        status: { in: ['SUCCESS', 'PROCESSING'] },
      },
    });

    const todayTotal = todayPurchases.reduce(
      (sum, p) => sum + toNumber(p.purchaseAmount || 0),
      0
    );

    if (todayTotal + amount > dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit exceeded: $${todayTotal} spent today, attempting $${amount}, limit is $${dailyLimit}`,
      };
    }

    // 6. Verificar límite mensual
    const monthlyLimit = env.AUTO_PURCHASE_MONTHLY_LIMIT ?? 10000;
    const monthStart = new Date(today);
    monthStart.setDate(1);

    const monthPurchases = await prisma.purchaseLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: monthStart,
        },
        status: { in: ['SUCCESS', 'PROCESSING'] },
      },
    });

    const monthTotal = monthPurchases.reduce(
      (sum, p) => sum + toNumber(p.purchaseAmount || 0),
      0
    );

    if (monthTotal + amount > monthlyLimit) {
      return {
        allowed: false,
        reason: `Monthly limit exceeded: $${monthTotal} spent this month, attempting $${amount}, limit is $${monthlyLimit}`,
      };
    }

    // 7. Validar capital (esto se hace en webhook también, pero agregamos aquí como guardrail adicional)
    try {
      const { workflowConfigService } = await import('./workflow-config.service');
      const totalCapital = await workflowConfigService.getWorkingCapital(userId);

      const pendingOrders = await prisma.sale.findMany({
        where: {
          userId,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      });
      const pendingCost = pendingOrders.reduce(
        (sum, order) => sum + toNumber(order.aliexpressCost || 0),
        0
      );

      const availableCapital = totalCapital - pendingCost;
      const capitalBuffer = Number(process.env.WORKING_CAPITAL_BUFFER || '0.20'); // 20% buffer
      const requiredCapital = amount * (1 + capitalBuffer);

      if (availableCapital < requiredCapital) {
        return {
          allowed: false,
          reason: `Insufficient capital: available $${availableCapital}, required $${requiredCapital}`,
        };
      }
    } catch (capitalError: any) {
      logger.warn('[AutoPurchaseGuardrails] Error validating capital, allowing purchase', {
        error: capitalError.message,
        userId,
      });
      // No bloquear si hay error validando capital - ya se valida en webhook
    }

    return {
      allowed: true,
    };
  }

  /**
   * ✅ FASE 4: Registrar intento de compra (para idempotencia)
   */
  static async recordPurchaseAttempt(
    userId: number,
    orderId: string,
    amount: number,
    productId: number,
    productUrl: string,
    dryRun: boolean = false
  ): Promise<number> {
    if (dryRun) {
      logger.info('[AutoPurchaseGuardrails] DRY-RUN: Would create purchase log', {
        userId,
        orderId,
        amount,
        productId,
      });
      return -1; // ID ficticio para dry-run
    }

    try {
      // Buscar si ya existe
      const existing = await prisma.purchaseLog.findFirst({
        where: {
          userId,
          orderId,
        },
      });

      if (existing) {
        return existing.id;
      }

      // Crear nuevo registro
      const purchaseLog = await prisma.purchaseLog.create({
        data: {
          userId,
          orderId,
          productId,
          supplierUrl: productUrl,
          purchaseAmount: amount,
          quantity: 1,
          status: 'PROCESSING',
          success: false,
          capitalValidated: true,
          retryAttempt: 0,
          maxRetries: 3,
        },
      });

      return purchaseLog.id;
    } catch (error: any) {
      logger.error('[AutoPurchaseGuardrails] Error recording purchase attempt', {
        error: error.message,
        userId,
        orderId,
      });
      throw error;
    }
  }

  /**
   * ✅ FASE 4: Obtener estadísticas de compras del usuario
   */
  static async getUserPurchaseStats(userId: number): Promise<{
    todayTotal: number;
    monthTotal: number;
    dailyLimit: number;
    monthlyLimit: number;
    todayCount: number;
    monthCount: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const monthStart = new Date(today);
    monthStart.setDate(1);

    const [todayPurchases, monthPurchases] = await Promise.all([
      prisma.purchaseLog.findMany({
        where: {
          userId,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
          status: { in: ['SUCCESS', 'PROCESSING'] },
        },
      }),
      prisma.purchaseLog.findMany({
        where: {
          userId,
          createdAt: {
            gte: monthStart,
          },
          status: { in: ['SUCCESS', 'PROCESSING'] },
        },
      }),
    ]);

    const todayTotal = todayPurchases.reduce(
      (sum, p) => sum + toNumber(p.purchaseAmount || 0),
      0
    );
    const monthTotal = monthPurchases.reduce(
      (sum, p) => sum + toNumber(p.purchaseAmount || 0),
      0
    );

    return {
      todayTotal,
      monthTotal,
      dailyLimit: env.AUTO_PURCHASE_DAILY_LIMIT ?? 1000,
      monthlyLimit: env.AUTO_PURCHASE_MONTHLY_LIMIT ?? 10000,
      todayCount: todayPurchases.length,
      monthCount: monthPurchases.length,
    };
  }
}

export default AutoPurchaseGuardrailsService;

