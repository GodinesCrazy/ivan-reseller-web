/**
 * Controller para Profitability API - FASE 3: Evaluación de Rentabilidad
 */

import { Request, Response } from 'express';
import { profitabilityService, type ProfitabilityEvaluation } from './profitability.service';
import { aliExpressSearchService, type ProductCandidate } from '../aliexpress/aliexpress-search.service';
import { prisma } from '../../config/database';
import logger from '../../config/logger';
import type { ProfitabilityConfig } from './profitability.service';

/**
 * Endpoint para evaluar rentabilidad de productos candidatos
 * GET /api/profitability/evaluate
 * FASE 3: Evaluación de Rentabilidad
 */
export const evaluateProducts = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado',
        message: 'Se requiere autenticación',
      });
    }

    // Parámetros de configuración
    const marketplace = (req.query.marketplace as 'ebay' | 'amazon' | 'mercadolibre') || 'ebay';
    const targetCountry = (req.query.targetCountry as string) || 'US';
    const desiredMargin = req.query.desiredMargin ? parseFloat(req.query.desiredMargin as string) : undefined;
    const minMargin = req.query.minMargin ? parseFloat(req.query.minMargin as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    console.log('[PROFITABILITY] Evaluating products');
    logger.info('[Profitability] Iniciando evaluación de rentabilidad', {
      userId,
      marketplace,
      targetCountry,
      desiredMargin,
      minMargin,
      limit,
    });

    // 1. Obtener productos candidatos de la base de datos
    const candidateProducts = await prisma.product.findMany({
      where: {
        userId,
        status: 'candidate', // Productos con status 'candidate' de FASE 2
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log('[PROFITABILITY] Candidate products found:', candidateProducts.length);

    if (candidateProducts.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          evaluations: [],
          summary: {
            total: 0,
            publishable: 0,
            discarded: 0,
          },
          message: 'No hay productos candidatos para evaluar',
        },
      });
    }

    // 2. Convertir productos de DB a ProductCandidate
    const candidates: ProductCandidate[] = candidateProducts.map(product => {
      const productData = product.productData ? JSON.parse(product.productData) : {};
      
      return {
        productId: productData.productId || `product_${product.id}`,
        title: product.title,
        basePrice: Number(product.aliexpressPrice),
        currency: product.currency || 'USD',
        shippingCost: product.shippingCost ? Number(product.shippingCost) : null,
        estimatedDeliveryDays: productData.estimatedDeliveryDays || null,
        rating: productData.rating || null,
        ordersCount: productData.ordersCount || null,
        affiliateLink: product.aliexpressUrl,
        sourceKeyword: product.category || productData.sourceKeyword || 'unknown',
        trendScore: productData.trendScore || 50,
        priority: productData.priority || 'medium',
        productUrl: product.aliexpressUrl,
        productImageUrl: product.images ? JSON.parse(product.images)[0] : '',
        shopName: productData.shopName,
        shopUrl: productData.shopUrl,
      };
    });

    // 3. Evaluar cada producto
    const config: ProfitabilityConfig = {
      marketplace,
      targetCountry,
      desiredMargin,
      minMargin,
    };

    const evaluations: ProfitabilityEvaluation[] = [];
    let publishableCount = 0;
    let discardedCount = 0;

    for (const candidate of candidates) {
      try {
        console.log('[PROFITABILITY] Evaluating product:', candidate.productId);
        
        const evaluation = await profitabilityService.evaluateProduct(candidate, config);
        evaluations.push(evaluation);

        // Actualizar breakdown con precio de venta final
        const updatedBreakdown = profitabilityService.recalculateCostsWithSalePrice(
          evaluation.costBreakdown,
          evaluation.salePrice,
          config
        );
        evaluation.costBreakdown = updatedBreakdown;
        evaluation.estimatedProfit = evaluation.salePrice - updatedBreakdown.totalCost;
        evaluation.profitMargin = evaluation.salePrice > 0 
          ? (evaluation.estimatedProfit / evaluation.salePrice) * 100 
          : 0;

        // Contar decisiones
        if (evaluation.decision === 'publish') {
          publishableCount++;
        } else {
          discardedCount++;
        }

        // 4. Actualizar producto en base de datos
        const productId = candidateProducts.find(p => 
          p.aliexpressUrl === candidate.productUrl
        )?.id;

        if (productId) {
          await prisma.product.update({
            where: { id: productId },
            data: {
              status: evaluation.decision === 'publish' ? 'publishable' : 'discarded',
              suggestedPrice: evaluation.salePrice,
              finalPrice: evaluation.salePrice,
              shippingCost: updatedBreakdown.shippingCost,
              importTax: updatedBreakdown.taxesAndDuties,
              totalCost: updatedBreakdown.totalCost,
              targetCountry: targetCountry,
              productData: JSON.stringify({
                ...JSON.parse(candidateProducts.find(p => p.id === productId)!.productData || '{}'),
                profitabilityEvaluation: {
                  decision: evaluation.decision,
                  reason: evaluation.reason,
                  estimatedProfit: evaluation.estimatedProfit,
                  profitMargin: evaluation.profitMargin,
                  costBreakdown: updatedBreakdown,
                  evaluatedAt: evaluation.evaluatedAt.toISOString(),
                },
              }),
              updatedAt: new Date(),
            },
          });
        }

      } catch (error: any) {
        logger.warn('[Profitability] Error evaluando producto individual', {
          productId: candidate.productId,
          error: error.message,
        });
        // Continuar con siguiente producto
      }
    }

    console.log('[PROFITABILITY] Evaluation complete:', {
      total: evaluations.length,
      publishable: publishableCount,
      discarded: discardedCount,
    });

    logger.info('[Profitability] Evaluación completada', {
      userId,
      total: evaluations.length,
      publishable: publishableCount,
      discarded: discardedCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        evaluations,
        summary: {
          total: evaluations.length,
          publishable: publishableCount,
          discarded: discardedCount,
        },
        meta: {
          marketplace,
          targetCountry,
          evaluatedAt: new Date().toISOString(),
        },
      },
    });

  } catch (error: any) {
    logger.error('[Profitability] Error en evaluación de rentabilidad', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al evaluar rentabilidad',
      message: error.message,
    });
  }
};
