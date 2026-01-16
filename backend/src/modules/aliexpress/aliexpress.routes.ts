/**
 * Rutas para AliExpress Affiliate API
 */

import { Router } from 'express';
import {
  handleOAuthCallback,
  initiateOAuth,
  oauthDebug,
  getOAuthRedirectUrl,
  generateAffiliateLink,
  testAffiliateLink,
  searchProducts,
  getTokenStatus,
} from './aliexpress.controller';

const router = Router();

/**
 * @swagger
 * /api/aliexpress/callback:
 *   get:
 *     summary: Callback OAuth de AliExpress
 *     tags: [AliExpress]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Código de autorización de AliExpress
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State para validación CSRF
 *     responses:
 *       200:
 *         description: Autenticación completada exitosamente
 *       400:
 *         description: Parámetros inválidos
 *       500:
 *         description: Error del servidor
 */
router.get('/callback', handleOAuthCallback);

/**
 * @swagger
 * /api/aliexpress/auth:
 *   get:
 *     summary: Iniciar flujo OAuth de AliExpress
 *     tags: [AliExpress]
 *     responses:
 *       200:
 *         description: URL de autorización generada
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
 *                     authUrl:
 *                       type: string
 *                     state:
 *                       type: string
 */
router.get('/auth', initiateOAuth);

/**
 * @swagger
 * /api/aliexpress/oauth-debug:
 *   get:
 *     summary: Debug endpoint para verificar configuración OAuth (solo admin en producción)
 *     tags: [AliExpress]
 *     parameters:
 *       - in: header
 *         name: X-Debug-Key
 *         required: false
 *         schema:
 *           type: string
 *         description: Debug key requerido en producción
 *     responses:
 *       200:
 *         description: Información de debug OAuth (sin secretos)
 *       403:
 *         description: No autorizado (en producción requiere X-Debug-Key válido)
 *       500:
 *         description: Error del servidor
 */
router.get('/oauth-debug', oauthDebug);

/**
 * @swagger
 * /api/aliexpress/oauth-redirect-url:
 *   get:
 *     summary: Obtener información de la URL de OAuth redirect (protegido, requiere X-Debug-Key en producción)
 *     tags: [AliExpress]
 *     parameters:
 *       - in: header
 *         name: X-Debug-Key
 *         required: false
 *         schema:
 *           type: string
 *         description: Debug key requerido en producción
 *     responses:
 *       200:
 *         description: Información de OAuth redirect URL (sin secretos)
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
 *                     oauthBaseUrl:
 *                       type: string
 *                     clientIdMasked:
 *                       type: string
 *                     clientIdTail:
 *                       type: string
 *                     redirectUri:
 *                       type: string
 *                     scope:
 *                       type: string
 *                     stateLength:
 *                       type: number
 *       403:
 *         description: No autorizado (en producción requiere X-Debug-Key válido)
 *       500:
 *         description: Error del servidor
 */
router.get('/oauth-redirect-url', getOAuthRedirectUrl);

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
 * /api/aliexpress/token-status:
 *   get:
 *     summary: Verificar estado del token OAuth
 *     tags: [AliExpress]
 *     responses:
 *       200:
 *         description: Estado del token
 */
router.get('/token-status', getTokenStatus);

export default router;

