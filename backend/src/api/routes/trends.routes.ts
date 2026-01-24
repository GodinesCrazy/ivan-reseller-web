/**
 * Routes para Trends API - FASE 1: Deteccin de Tendencias
 * 
 * Endpoint: GET /api/trends/keywords
 * Retorna keywords priorizadas basadas en tendencias reales
 */

import { Router, Request, Response } from 'express';
import { trendsService } from '../../services/trends.service';
import logger from '../../config/logger';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/trends/keywords:
 *   get:
 *     summary: Obtener keywords de tendencias priorizadas
 *     tags: [Trends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *           default: US
 *         description: Cdigo de regin (US, ES, MX, etc.)
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Das hacia atrs para analizar
 *       - in: query
 *         name: maxKeywords
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Mximo de keywords a retornar
 *     responses:
 *       200:
 *         description: Lista de keywords priorizadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       keyword:
 *                         type: string
 *                       score:
 *                         type: number
 *                       region:
 *                         type: string
 *                       date:
 *                         type: string
 *                       trend:
 *                         type: string
 *                         enum: [rising, stable, declining]
 *                       searchVolume:
 *                         type: number
 *                       category:
 *                         type: string
 *                       segment:
 *                         type: string
 *                       priority:
 *                         type: string
 *                         enum: [high, medium, low]
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
/**
 * GET /api/trends/keywords
 * Obtener keywords de tendencias priorizadas
 */
router.get('/keywords', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const region = (req.query.region as string) || 'US';
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const maxKeywords = req.query.maxKeywords ? parseInt(req.query.maxKeywords as string, 10) : 50;

    console.log('[TRENDS-API] Obteniendo keywords de tendencias', {
      userId,
      region,
      days,
      maxKeywords,
    });

    logger.info('[Trends API] Obteniendo keywords de tendencias', {
      userId,
      region,
      days,
      maxKeywords,
    });

    const keywords = await trendsService.getTrendingKeywords({
      region,
      days,
      maxKeywords,
      userId,
    });

    logger.info('[Trends API] Keywords obtenidas exitosamente', {
      count: keywords.length,
      userId,
    });

    return res.status(200).json({
      success: true,
      data: keywords,
      meta: {
        count: keywords.length,
        region,
        days,
        generatedAt: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    logger.error('[Trends API] Error obteniendo keywords de tendencias', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: 'Error al obtener keywords de tendencias',
      message: error.message,
    });
  }
});

export default router;
