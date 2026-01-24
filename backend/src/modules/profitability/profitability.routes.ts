/**
 * Routes para Profitability API - FASE 3: Evaluación de Rentabilidad
 */

import { Router } from 'express';
import { evaluateProducts } from './profitability.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/profitability/evaluate:
 *   get:
 *     summary: Evaluar rentabilidad de productos candidatos (FASE 3)
 *     tags: [Profitability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: marketplace
 *         schema:
 *           type: string
 *           enum: [ebay, amazon, mercadolibre]
 *           default: ebay
 *         description: Marketplace objetivo
 *       - in: query
 *         name: targetCountry
 *         schema:
 *           type: string
 *           default: US
 *         description: País destino para cálculo de impuestos
 *       - in: query
 *         name: desiredMargin
 *         schema:
 *           type: number
 *           default: 0.25
 *         description: Margen deseado (0.25 = 25%)
 *       - in: query
 *         name: minMargin
 *         schema:
 *           type: number
 *           default: 0.15
 *         description: Margen mínimo para publicar (0.15 = 15%)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Máximo de productos a evaluar
 *     responses:
 *       200:
 *         description: Evaluación completada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     evaluations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: string
 *                           decision:
 *                             type: string
 *                             enum: [publish, discard]
 *                           reason:
 *                             type: string
 *                           salePrice:
 *                             type: number
 *                           estimatedProfit:
 *                             type: number
 *                           profitMargin:
 *                             type: number
 *                           costBreakdown:
 *                             type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         publishable:
 *                           type: integer
 *                         discarded:
 *                           type: integer
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/evaluate', authenticate, evaluateProducts);

console.log('[PROFITABILITY] Routes registered:');
console.log('[PROFITABILITY]   - GET /api/profitability/evaluate (FASE 3)');

export default router;
