import { trace } from '../utils/boot-trace';
trace('loading successful-operation.service');

import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import logger from '../config/logger';

const prisma = new PrismaClient();

export interface CreateSuccessfulOperationDto {
  userId: number;
  productId: number;
  saleId: number;
  startDate: Date;
  completionDate: Date;
  totalProfit: number;
  expectedProfit: number;
  hadReturns?: boolean;
  hadIssues?: boolean;
  issuesDescription?: string;
  customerSatisfaction?: number;
  aiPredictionScore?: number;
  aiConfidence?: number;
  learningPattern?: any;
}

export class SuccessfulOperationService {
  /**
   * Marcar una venta como operación exitosa completa
   */
  async markAsSuccessful(dto: CreateSuccessfulOperationDto) {
    const sale = await prisma.sale.findUnique({
      where: { id: dto.saleId },
      include: { product: true }
    });

    if (!sale) {
      throw new AppError('Venta no encontrada', 404);
    }

    // Calcular días para completar
    const daysToComplete = Math.ceil(
      (dto.completionDate.getTime() - dto.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calcular precisión de ganancia
    const profitAccuracy = dto.expectedProfit > 0
      ? ((dto.totalProfit / dto.expectedProfit) * 100)
      : 100;

    // Crear registro de operación exitosa
    const operation = await prisma.successfulOperation.create({
      data: {
        userId: dto.userId,
        productId: dto.productId,
        saleId: dto.saleId,
        operationType: 'full_cycle',
        startDate: dto.startDate,
        completionDate: dto.completionDate,
        daysToComplete,
        totalProfit: dto.totalProfit,
        expectedProfit: dto.expectedProfit,
        profitAccuracy,
        hadReturns: dto.hadReturns || false,
        hadIssues: dto.hadIssues || false,
        issuesDescription: dto.issuesDescription,
        customerSatisfaction: dto.customerSatisfaction,
        aiPredictionScore: dto.aiPredictionScore,
        aiConfidence: dto.aiConfidence,
        actualSuccess: !dto.hadReturns && !dto.hadIssues,
        learningPattern: dto.learningPattern ? JSON.stringify(dto.learningPattern) : null
      }
    });

    // Actualizar venta como ciclo completo
    await prisma.sale.update({
      where: { id: dto.saleId },
      data: {
        isCompleteCycle: true,
        completedAt: dto.completionDate
      }
    });

    logger.info('Successful operation recorded', {
      operationId: operation.id,
      userId: dto.userId,
      saleId: dto.saleId,
      profitAccuracy
    });

    return operation;
  }

  /**
   * Obtener estadísticas de operaciones exitosas del usuario
   */
  async getUserSuccessStats(userId: number) {
    const operations = await prisma.successfulOperation.findMany({
      where: { userId },
      include: {
        product: true,
        sale: true
      }
    });

    const total = operations.length;
    const successful = operations.filter(op => op.actualSuccess && !op.hadReturns && !op.hadIssues).length;
    const withReturns = operations.filter(op => op.hadReturns).length;
    const withIssues = operations.filter(op => op.hadIssues).length;

    const avgProfitAccuracy = total > 0
      ? operations.reduce((sum, op) => sum + op.profitAccuracy, 0) / total
      : 0;

    const avgDaysToComplete = total > 0
      ? operations.reduce((sum, op) => sum + op.daysToComplete, 0) / total
      : 0;

    const avgCustomerSatisfaction = operations
      .filter(op => op.customerSatisfaction !== null)
      .reduce((sum, op) => sum + (op.customerSatisfaction || 0), 0) / 
      (operations.filter(op => op.customerSatisfaction !== null).length || 1);

    return {
      total,
      successful,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      withReturns,
      withIssues,
      avgProfitAccuracy,
      avgDaysToComplete,
      avgCustomerSatisfaction
    };
  }

  /**
   * Obtener patrones de aprendizaje de operaciones exitosas
   */
  async getLearningPatterns(userId?: number) {
    const where = userId ? { userId, actualSuccess: true } : { actualSuccess: true };

    const successfulOps = await prisma.successfulOperation.findMany({
      where,
      include: {
        product: true
      },
      orderBy: {
        totalProfit: 'desc'
      },
      take: 100 // Top 100 operaciones exitosas
    });

    // Extraer patrones
    const patterns = {
      avgProfitAccuracy: successfulOps.length > 0
        ? successfulOps.reduce((sum, op) => sum + op.profitAccuracy, 0) / successfulOps.length
        : 0,
      avgDaysToComplete: successfulOps.length > 0
        ? successfulOps.reduce((sum, op) => sum + op.daysToComplete, 0) / successfulOps.length
        : 0,
      categories: {} as Record<string, number>,
      priceRanges: [] as Array<{ min: number; max: number; count: number }>,
      profitMargins: [] as Array<{ min: number; max: number; count: number }>
    };

    // Analizar categorías más exitosas
    successfulOps.forEach(op => {
      const category = op.product.category || 'unknown';
      patterns.categories[category] = (patterns.categories[category] || 0) + 1;
    });

    return patterns;
  }

  /**
   * Verificar si una venta puede marcarse como exitosa
   */
  async canMarkAsSuccessful(saleId: number): Promise<boolean> {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        successfulOperation: true
      }
    });

    if (!sale) return false;
    if (sale.successfulOperation) return false; // Ya está marcada
    if (sale.status !== 'DELIVERED') return false; // Debe estar entregada

    return true;
  }
}

export const successfulOperationService = new SuccessfulOperationService();

