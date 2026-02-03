/**
 * Rutas para AliExpress Affiliate API
 * 
 * ⚠️ IMPORTANTE: AliExpress Affiliate API does NOT support OAuth interactive login.
 * The API works EXCLUSIVELY with:
 * - app_key
 * - app_secret
 * - sign (signature)
 * - timestamp
 * 
 * All requests must be signed according to AliExpress TOP API specification.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  generateAffiliateLink,
  testAffiliateLink,
  searchProducts,
  getHealthStatus,
  getAffiliateHealth,
  getCandidates,
  getOAuthUrl,
  oauthCallback,
} from './aliexpress.controller';

const router = Router();

/**
 * @swagger
 * /api/aliexpress/generate-link:
 *   post:
 *     summary: Generar link afiliado para un producto
 *     tags: [AliExpress]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *             properties:
 *               productId:
 *                 type: string
 *               productUrl:
 *                 type: string
 *               trackingId:
 *                 type: string
 *               promotionName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Link afiliado generado exitosamente
 *       400:
 *         description: Parámetros inválidos
 *       500:
 *         description: Error del servidor
 */
router.post('/generate-link', generateAffiliateLink);

/**
 * @swagger
 * /api/aliexpress/test-link:
 *   get:
 *     summary: Endpoint de prueba para generar link afiliado
 *     tags: [AliExpress]
 *     parameters:
 *       - in: query
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del producto de AliExpress
 *     responses:
 *       200:
 *         description: Link de prueba generado
 *       400:
 *         description: productId requerido
 */
router.get('/test-link', testAffiliateLink);

/**
 * @swagger
 * /api/aliexpress/search:
 *   get:
 *     summary: Buscar productos en AliExpress
 *     tags: [AliExpress]
 *     parameters:
 *       - in: query
 *         name: keywords
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: pageNo
 *         schema:
 *           type: number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Lista de productos encontrados
 */
router.get('/search', searchProducts);

/**
 * @swagger
 * /api/aliexpress/health:
 *   get:
 *     summary: Health check y diagnóstico de AliExpress Affiliate API
 *     tags: [AliExpress]
 *     responses:
 *       200:
 *         description: Estado de la configuración y conectividad
 */
router.get('/health', getHealthStatus);

/**
 * GET /api/aliexpress/affiliate/health - Token status (hasToken, expiresAt, expired)
 */
router.get('/affiliate/health', getAffiliateHealth);

/**
 * GET /api/aliexpress/oauth/url - Get OAuth authorization URL
 */
router.get('/oauth/url', getOAuthUrl);

/**
 * GET /api/aliexpress/callback - OAuth callback: exchange code for tokens
 */
router.get('/callback', oauthCallback);

/**
 * @swagger
 * /api/aliexpress/candidates:
 *   get:
 *     summary: Obtener productos candidatos basados en tendencias (FASE 2)
 *     tags: [AliExpress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Máximo de candidatos a retornar
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [high, medium, low]
 *         description: Filtrar por prioridad de keyword
 *       - in: query
 *         name: minTrendScore
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Score mínimo de tendencia
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *           default: US
 *         description: Región para búsqueda de tendencias
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Días hacia atrás para analizar tendencias
 *     responses:
 *       200:
 *         description: Lista de productos candidatos
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/candidates', authenticate, getCandidates);

console.log('[ALIEXPRESS-AFFILIATE] Routes registered:');
console.log('[ALIEXPRESS-AFFILIATE]   - POST /api/aliexpress/generate-link');
console.log('[ALIEXPRESS-AFFILIATE]   - GET /api/aliexpress/test-link');
console.log('[ALIEXPRESS-AFFILIATE]   - GET /api/aliexpress/search');
console.log('[ALIEXPRESS-AFFILIATE]   - GET /api/aliexpress/health');
console.log('[ALIEXPRESS-AFFILIATE]   - GET /api/aliexpress/oauth/url (OAuth start)');
console.log('[ALIEXPRESS-AFFILIATE]   - GET /api/aliexpress/callback (OAuth callback)');
console.log('[ALIEXPRESS-AFFILIATE]   - GET /api/aliexpress/candidates (FASE 2)');

export default router;

